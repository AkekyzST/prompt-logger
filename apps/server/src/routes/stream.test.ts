import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Integration test for GET /api/stream/:sessionId (SSE).
 *
 * Seed env BEFORE dynamic imports; config.ts validates at module load.
 */

const TMP_DIR = mkdtempSync(join(tmpdir(), 'plog-stream-'));
process.env.NODE_ENV = 'test';
process.env.PORT = '3200';
process.env.PUBLIC_BASE_URL = 'http://localhost';
process.env.DATABASE_PATH = join(TMP_DIR, 'stream.db');
process.env.INGEST_TOKEN = 'stream-token-0123456789abcdef';
process.env.INGEST_RATE_LIMIT_PER_MIN = '1000';
process.env.INGEST_MAX_BODY_KB = '64';
process.env.OIDC_ISSUER = 'https://example.com';
process.env.OIDC_CLIENT_ID = 'cid';
process.env.OIDC_CLIENT_SECRET = 'csec';
process.env.OIDC_REDIRECT_URI = 'http://localhost/auth/callback';
process.env.ADMIN_EMAILS = 'a@b.c';
process.env.LOG_LEVEL = 'fatal';
process.env.SSE_HEARTBEAT_SECONDS = '60';
process.env.SSE_MAX_CONNECTIONS = '500';
process.env.SESSION_COOKIE_NAME = 'pl_sess';

const TOKEN = process.env.INGEST_TOKEN;

// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let app: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let db: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let rawDb: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let sessionsTable: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let usersTable: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let sessionGrantsTable: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let authSessionsTable: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let createAuthSession: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let getOrCreateEmitter: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let getActiveConnectionsForTests: any;

async function ingest(
  claudeSid: string,
  prompt: string,
  fwd = '198.51.100.50'
): Promise<{ id: string; seq: number }> {
  const res = await app.fetch(
    new Request('http://localhost/api/ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        'x-forwarded-for': fwd,
      },
      body: JSON.stringify({ claude_session_id: claudeSid, prompt }),
    })
  );
  if (res.status !== 201) throw new Error(`ingest failed: ${res.status}`);
  return (await res.json()) as { id: string; seq: number };
}

async function openStream(sessionId: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `pl_sess=${cookie}`;
  return app.fetch(
    new Request(`http://localhost/api/stream/${sessionId}`, {
      method: 'GET',
      headers,
    })
  );
}

/**
 * Parse an SSE event stream up to `n` events (or until the stream ends).
 * Returns the parsed events. Aborts the underlying reader when the limit is
 * reached so the server-side handler sees the disconnect.
 */
async function readEvents(
  res: Response,
  limit: number,
  timeoutMs: number
): Promise<Array<{ event: string; data: string }>> {
  const body = res.body;
  if (!body) throw new Error('no stream body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ event: string; data: string }> = [];
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  while (events.length < limit) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const timer = new Promise<{ done: true }>((resolvePromise) => {
      setTimeout(() => resolvePromise({ done: true }), remaining).unref?.();
    });
    const next = reader.read().then((r) => ({ done: false as const, result: r }));
    const raced = await Promise.race([timer, next]);
    if ('done' in raced && raced.done) break;
    const { result } = raced as { done: false; result: ReadableStreamReadResult<Uint8Array> };
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });

    // Split on SSE record boundary (blank line).
    let idx: number;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard parser idiom
    while ((idx = buffer.indexOf('\n\n')) >= 0 && events.length < limit) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const dataLines: string[] = [];
      let isComment = false;
      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) {
          isComment = true;
          continue;
        }
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      if (isComment && dataLines.length === 0) continue; // heartbeat
      events.push({ event, data: dataLines.join('\n') });
    }
  }

  // Release the reader so the server sees the disconnect.
  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }
  return events;
}

beforeAll(async () => {
  const { runMigrations } = await import('../lib/db/migrate.js');
  const client = await import('../lib/db/client.js');
  db = client.db;
  rawDb = client.rawDb;
  const schema = await import('../schema/index.js');
  sessionsTable = schema.sessions;
  usersTable = schema.users;
  sessionGrantsTable = schema.sessionGrants;
  authSessionsTable = schema.authSessions;

  runMigrations();

  const { Hono } = await import('hono');
  const { ingestRoutes } = await import('./ingest.js');
  const { streamRoutes, __getActiveConnectionsForTests } = await import('./stream.js');
  const { sessionMiddleware } = await import('../middleware/session.js');
  const authModule = await import('../lib/auth/sessions.js');
  createAuthSession = authModule.createAuthSession;
  const emitterModule = await import('../lib/emitter.js');
  getOrCreateEmitter = emitterModule.getOrCreateEmitter;
  getActiveConnectionsForTests = __getActiveConnectionsForTests;

  app = new Hono();
  app.use('*', sessionMiddleware);
  app.route('/api', ingestRoutes);
  app.route('/api', streamRoutes);
});

beforeEach(() => {
  // Clean slate — delete data but keep tables.
  db.delete(authSessionsTable).run();
  db.delete(sessionGrantsTable).run();
  db.delete(usersTable).run();
});

afterAll(() => {
  try {
    rawDb?.close();
  } catch {
    /* ignore */
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
});

function seedUserAndCookie(id: string, email: string, role: 'admin' | 'viewer'): string {
  const now = new Date().toISOString();
  db.insert(usersTable)
    .values({ id, email, displayName: null, role, createdAt: now, lastLoginAt: null })
    .run();
  const { token } = createAuthSession(id, null, null);
  return token;
}

describe('GET /api/stream/:sessionId — auth', () => {
  it('returns 401 when no session cookie is present', async () => {
    // Create a private session first by ingesting one prompt.
    await ingest('no-cookie-sid', 'hi');
    const sess = db
      .select()
      .from(sessionsTable)
      .where((await import('drizzle-orm')).eq(sessionsTable.claudeSessionId, 'no-cookie-sid'))
      .get();
    const res = await openStream(sess.id);
    expect(res.status).toBe(401);
  });

  it('returns 403 when a viewer tries to open a private session they do not own', async () => {
    await ingest('private-sid', 'secret content');
    const { eq } = await import('drizzle-orm');
    const sess = db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.claudeSessionId, 'private-sid'))
      .get();
    const cookie = seedUserAndCookie('u-viewer', 'viewer@example.test', 'viewer');
    const res = await openStream(sess.id, cookie);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/stream/:sessionId — snapshot + live', () => {
  it('delivers a snapshot of existing prompts and then live events, cleaning up listeners on disconnect', async () => {
    // Ingest 3 prompts.
    const claudeSid = 'snap-sid';
    await ingest(claudeSid, 'prompt one');
    await ingest(claudeSid, 'prompt two');
    await ingest(claudeSid, 'prompt three');

    const { eq } = await import('drizzle-orm');
    const sess = db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.claudeSessionId, claudeSid))
      .get();

    const cookie = seedUserAndCookie('u-admin-1', 'admin1@example.test', 'admin');

    const res = await openStream(sess.id, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toMatch(/text\/event-stream/);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    // Read the snapshot event, then ingest a 4th prompt and read one more.
    const body = res.body;
    if (!body) throw new Error('missing body');
    const reader = body.getReader();
    const decoder = new TextDecoder();

    async function readOne(timeoutMs: number): Promise<{ event: string; data: string }> {
      let buffer = '';
      const deadline = Date.now() + timeoutMs;
      while (true) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('sse read timeout');
        const timer = new Promise<{ done: true }>((resolvePromise) => {
          setTimeout(() => resolvePromise({ done: true }), remaining).unref?.();
        });
        const next = reader.read().then((r) => ({ done: false as const, result: r }));
        const raced = await Promise.race([timer, next]);
        if ('done' in raced && raced.done) throw new Error('sse read timeout');
        const { result } = raced as {
          done: false;
          result: ReadableStreamReadResult<Uint8Array>;
        };
        if (result.done) throw new Error('stream ended early');
        buffer += decoder.decode(result.value, { stream: true });
        const idx = buffer.indexOf('\n\n');
        if (idx >= 0) {
          const raw = buffer.slice(0, idx);
          let event = 'message';
          const dataLines: string[] = [];
          let isComment = false;
          for (const line of raw.split('\n')) {
            if (line.startsWith(':')) {
              isComment = true;
              continue;
            }
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
          }
          if (isComment && dataLines.length === 0) continue;
          return { event, data: dataLines.join('\n') };
        }
      }
    }

    const snapshot = await readOne(2000);
    expect(snapshot.event).toBe('snapshot');
    const snapPayload = JSON.parse(snapshot.data) as {
      prompts: Array<{ seq: number; content: string }>;
    };
    expect(snapPayload.prompts).toHaveLength(3);
    expect(snapPayload.prompts.map((p) => p.seq)).toEqual([1, 2, 3]);

    // Now ingest a 4th prompt; the SSE connection should forward it.
    const t0 = Date.now();
    await ingest(claudeSid, 'prompt four');
    const live = await readOne(2000);
    const elapsed = Date.now() - t0;
    expect(live.event).toBe('prompt');
    const livePayload = JSON.parse(live.data) as { seq: number; content: string };
    expect(livePayload.seq).toBe(4);
    expect(livePayload.content).toContain('prompt four');
    expect(elapsed).toBeLessThan(500); // well under the 100ms target on a local box,
    // with headroom so CI jitter doesn't flake.

    // Disconnect and verify listener cleanup.
    const emitter = getOrCreateEmitter(sess.id);
    expect(emitter.listenerCount('prompt')).toBeGreaterThan(0);

    await reader.cancel();

    // Listener cleanup runs on the `abort` event from the raw signal, which
    // fires after the reader cancels. Give it up to 1s.
    const waitUntil = Date.now() + 1000;
    while (emitter.listenerCount('prompt') > 0 && Date.now() < waitUntil) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(emitter.listenerCount('prompt')).toBe(0);

    // Active connection counter back to zero.
    const waitUntilActive = Date.now() + 1000;
    while (getActiveConnectionsForTests() > 0 && Date.now() < waitUntilActive) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(getActiveConnectionsForTests()).toBe(0);
  });
});

describe('GET /api/stream/:sessionId — connection cap', () => {
  it('returns 503 with Retry-After once SSE_MAX_CONNECTIONS is reached', async () => {
    // Ingest so a session exists.
    await ingest('cap-sid', 'hello');
    const { eq } = await import('drizzle-orm');
    const sess = db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.claudeSessionId, 'cap-sid'))
      .get();

    const cookie = seedUserAndCookie('u-admin-2', 'admin2@example.test', 'admin');

    // Monkey-patch the module's cap via direct config mutation isn't possible
    // because `config` is frozen after loadConfig; instead, open streams up to
    // the actual configured cap only if it's small. We set SSE_MAX_CONNECTIONS
    // via env to a small number for this test file; re-importing is too
    // invasive, so we use a dedicated override here.
    const { config } = await import('../lib/config.js');
    const originalCap = config.SSE_MAX_CONNECTIONS;
    // biome-ignore lint/suspicious/noExplicitAny: deliberate test override
    (config as any).SSE_MAX_CONNECTIONS = 1;

    try {
      const first = await openStream(sess.id, cookie);
      expect(first.status).toBe(200);

      const second = await openStream(sess.id, cookie);
      expect(second.status).toBe(503);
      expect(second.headers.get('retry-after')).toBe('5');
      await second.body?.cancel();

      // Release the first stream.
      await first.body?.cancel();
    } finally {
      // biome-ignore lint/suspicious/noExplicitAny: deliberate test override
      (config as any).SSE_MAX_CONNECTIONS = originalCap;
    }

    // Wait for active count to drain.
    const waitUntilActive = Date.now() + 1000;
    while (getActiveConnectionsForTests() > 0 && Date.now() < waitUntilActive) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(getActiveConnectionsForTests()).toBe(0);
  });
});

// Keep unused helper import referenced so biome does not error out. Several
// fields above use `readEvents`'s helpers inline — retain the export to ease
// future test additions without triggering a dead-code lint.
void readEvents;
