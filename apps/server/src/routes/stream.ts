import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { config } from '../lib/config.js';
import { db } from '../lib/db/client.js';
import { getOrCreateEmitter } from '../lib/emitter.js';
import { logger } from '../lib/logger.js';
import { canViewSession, requireAuth } from '../middleware/access.js';
import type { AuthVariables } from '../middleware/session.js';
import { prompts } from '../schema/index.js';

/**
 * GET /api/stream/:sessionId — Server-Sent Events live feed for a session.
 *
 * Non-negotiable invariants (docs/ARCHITECTURE.md §10, CLAUDE.md "Access control"):
 *
 *   - Access check happens ONCE, at subscribe time. The emitter broadcast
 *     path does NOT re-check ACLs.
 *   - Listener cleanup happens on every termination path (normal close,
 *     client abort, server error). Teardown is wrapped in finally so a
 *     thrown error cannot leak an EventEmitter listener.
 *   - Global connection cap is enforced BEFORE the response body is opened,
 *     so we can return a synchronous 503 with a Retry-After header.
 *   - Required headers: Content-Type: text/event-stream, Cache-Control:
 *     no-cache, Connection: keep-alive, X-Accel-Buffering: no.
 */

export const streamRoutes = new Hono<{ Variables: AuthVariables }>();

streamRoutes.use('*', requireAuth);

/**
 * Module-level active connection counter. Single-process deployment only —
 * matches the in-memory emitter and in-memory rate limiter.
 */
let activeConnections = 0;

/** Exposed for tests only. Do not import from production code. */
export function __getActiveConnectionsForTests(): number {
  return activeConnections;
}

/**
 * Registry of live SSE shutdown callbacks. Each active stream registers a
 * function that writes a final `event: close` frame and resolves the
 * handler's park promise. The server graceful-shutdown path iterates the
 * registry to give every connected client a clean disconnect before the
 * HTTP server is closed.
 */
const shutdownCallbacks = new Set<() => void>();

export async function closeAllStreams(): Promise<void> {
  const callbacks = [...shutdownCallbacks];
  shutdownCallbacks.clear();
  for (const cb of callbacks) {
    try {
      cb();
    } catch {
      /* ignore — handler will still tear down via its own abort/finally path */
    }
  }
  // Give the handlers a microtask tick to flush their final frame and run
  // their finally blocks before the HTTP server closes their sockets.
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
}

const SNAPSHOT_LIMIT = 50;

type SnapshotPrompt = {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  redactions: string | null;
  created_at: string;
};

type LivePrompt = {
  id: string;
  seq: number;
  content: string;
  created_at: string;
  redactions: unknown;
};

function loadSnapshot(sessionId: string): SnapshotPrompt[] {
  // Grab the most recent N prompts in seq order, then reverse so the client
  // receives them oldest → newest — that's the order the UI wants to render.
  const rows = db
    .select({
      id: prompts.id,
      seq: prompts.seq,
      role: prompts.role,
      content: prompts.content,
      redactions: prompts.redactions,
      createdAt: prompts.createdAt,
    })
    .from(prompts)
    .where(eq(prompts.sessionId, sessionId))
    .orderBy(desc(prompts.seq))
    .limit(SNAPSHOT_LIMIT)
    .all();
  rows.reverse();
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    role: r.role,
    content: r.content,
    redactions: r.redactions,
    created_at: r.createdAt,
  }));
}

streamRoutes.get('/stream/:sessionId', (c) => {
  const user = c.get('user');
  if (!user) {
    // requireAuth already handles this; the narrow keeps TS honest.
    return c.json({ error: 'unauthenticated' }, 401);
  }

  const sessionId = c.req.param('sessionId');

  // Single access check. The broadcast path trusts this decision for the
  // lifetime of the subscription.
  if (!canViewSession(user.id, user.role, sessionId)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  // Connection cap — enforced BEFORE opening the stream so the client gets a
  // clean synchronous 503.
  if (activeConnections >= config.SSE_MAX_CONNECTIONS) {
    c.header('Retry-After', '5');
    return c.json({ error: 'too_many_connections' }, 503);
  }

  // Required SSE headers. streamSSE sets Content-Type, but we set the
  // proxy-friendly ones ourselves to guarantee they land on every response.
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return streamSSE(c, async (stream) => {
    const emitter = getOrCreateEmitter(sessionId);

    // Snapshot BEFORE attaching the listener, then dedupe in the listener so
    // an event that races the snapshot read is delivered exactly once.
    const snapshot = loadSnapshot(sessionId);
    const seenIds = new Set(snapshot.map((p) => p.id));

    const listener = (payload: LivePrompt): void => {
      if (seenIds.has(payload.id)) return;
      seenIds.add(payload.id);
      stream
        .writeSSE({ event: 'prompt', data: JSON.stringify(payload) })
        .catch((err) => logger.warn({ err, sessionId }, 'sse write failed'));
    };
    emitter.on('prompt', listener);
    activeConnections += 1;

    let heartbeatTimer: NodeJS.Timeout | undefined;
    let torndown = false;
    const teardown = (): void => {
      if (torndown) return;
      torndown = true;
      emitter.off('prompt', listener);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      activeConnections = Math.max(0, activeConnections - 1);
    };

    const abortSignal = c.req.raw.signal;

    try {
      await stream.writeSSE({
        event: 'snapshot',
        data: JSON.stringify({ prompts: snapshot }),
      });

      // Heartbeat — SSE comment lines keep proxies from closing idle conns.
      heartbeatTimer = setInterval(() => {
        stream.writeSSE({ data: '' }).catch(() => {
          // If the heartbeat write fails the connection is already dead;
          // the abort listener below will tear us down.
        });
      }, config.SSE_HEARTBEAT_SECONDS * 1000);
      heartbeatTimer.unref?.();

      // Park the handler until the client disconnects OR the server begins a
      // graceful shutdown. Hono's stream helper keeps the response open for
      // as long as this promise is unresolved.
      await new Promise<void>((resolvePromise) => {
        let resolved = false;
        const done = (): void => {
          if (resolved) return;
          resolved = true;
          resolvePromise();
        };
        const shutdownCb = (): void => {
          // Final `close` frame so the browser EventSource doesn't
          // auto-reconnect during an intentional shutdown.
          stream.writeSSE({ event: 'close', data: '' }).catch(() => {
            /* socket may already be half-closed */
          });
          done();
        };
        shutdownCallbacks.add(shutdownCb);

        if (abortSignal.aborted) {
          shutdownCallbacks.delete(shutdownCb);
          done();
          return;
        }
        abortSignal.addEventListener(
          'abort',
          () => {
            shutdownCallbacks.delete(shutdownCb);
            done();
          },
          { once: true }
        );
        stream.onAbort(() => {
          shutdownCallbacks.delete(shutdownCb);
          done();
        });
      });
    } catch (err) {
      logger.warn({ err, sessionId }, 'sse stream handler error');
    } finally {
      // Guarantee listener detachment on every code path.
      teardown();
    }
  });
});
