import { randomUUID } from 'node:crypto';
import { type ServerType, serve } from '@hono/node-server';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { config } from './lib/config.js';
import { rawDb } from './lib/db/client.js';
import { runMigrations } from './lib/db/migrate.js';
import { logger } from './lib/logger.js';
import { requireAuth } from './middleware/access.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { sessionMiddleware } from './middleware/session.js';
import { mountWeb } from './mount-web.js';
import { adminAuditRoutes } from './routes/admin/audit.js';
import { adminCodeRoutes } from './routes/admin/codes.js';
import { adminSessionRoutes } from './routes/admin/sessions.js';
import { adminUserRoutes } from './routes/admin/users.js';
import { authRoutes } from './routes/auth.js';
import { ingestRoutes } from './routes/ingest.js';
import { joinRoutes } from './routes/join.js';
import { meRoutes } from './routes/me.js';
import { sessionRoutes } from './routes/sessions.js';
import { closeAllStreams, streamRoutes } from './routes/stream.js';

const VERSION = process.env.GIT_SHA ?? 'dev';

// Run migrations before accepting traffic. Fail-fast on error.
try {
  runMigrations();
} catch (err) {
  logger.fatal({ err }, 'failed to run migrations');
  process.exit(1);
}

/**
 * Lightweight request logger: one line per request with method, path, status,
 * and duration. Uses a short request id so operators can correlate client
 * reports with server logs without pulling in an HTTP context library.
 */
const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const requestId = c.req.header('x-request-id') ?? randomUUID();
  (c as unknown as { set(key: string, value: unknown): void }).set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  try {
    await next();
  } finally {
    const durationMs = Date.now() - start;
    logger.info(
      {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs,
      },
      'request'
    );
  }
};

/**
 * Same-origin CORS policy. The hook POSTs from the loopback side and the
 * browser hits the same origin as the mounted UI, so we do NOT want to echo
 * arbitrary Origin values. Cross-origin requests get an explicit null ACAO
 * so browsers block them cleanly instead of getting a surprising success.
 */
const sameOriginCors: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header('origin');
  if (origin) {
    const publicOrigin = new URL(config.PUBLIC_BASE_URL).origin;
    if (origin === publicOrigin) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', 'Origin');
      c.header('Access-Control-Allow-Credentials', 'true');
    } else {
      c.header('Access-Control-Allow-Origin', 'null');
    }
  }
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'content-type, authorization, x-request-id');
    c.header('Access-Control-Max-Age', '600');
    return c.body(null, 204);
  }
  await next();
};

const app = new Hono();

// 1. Request logger — runs first so every response is logged.
app.use('*', requestLogger);

// 2. Same-origin CORS.
app.use('*', sameOriginCors);

// 3. Session middleware — reads cookie → attaches user if valid. Does not
//    reject; route-level guards are responsible for 401/403.
app.use('*', sessionMiddleware);

// 4. /healthz — unauthenticated, used by Docker healthcheck and Caddy upstream.
app.get('/healthz', (c) => {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    rawDb.prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }
  return c.json(
    { status: dbStatus === 'ok' ? 'ok' : 'error', db: dbStatus, version: VERSION },
    dbStatus === 'ok' ? 200 : 503
  );
});

// 5. OIDC auth routes — /login, /auth/callback, /logout.
app.route('/', authRoutes);

// 6. /api/ingest — bearerAuth + rateLimit + bodyLimit are attached inside the
//    ingestRoutes sub-app.
app.route('/api', ingestRoutes);

// 7. Viewer routes — require a valid session cookie (requireAuth runs inside
//    each sub-app). These return session data subject to canViewSession.
app.route('/api', meRoutes);
app.route('/api', sessionRoutes);
app.route('/api', joinRoutes);

// 8. SSE live stream — access check + listener lifecycle live inside
//    streamRoutes. Must be registered BEFORE admin routes because
//    Hono matches in registration order and /api/stream/:id should not be
//    intercepted by /api/admin/*.
app.route('/api', streamRoutes);

// 9. Admin routes — requireAuth → requireAdmin, then the four sub-apps.
app.use('/api/admin/*', requireAuth, requireAdmin);
app.route('/api/admin', adminSessionRoutes);
app.route('/api/admin', adminUserRoutes);
app.route('/api/admin', adminCodeRoutes);
app.route('/api/admin', adminAuditRoutes);

// 10. SvelteKit mount seam — catch-all for any non-/api request that hasn't
//     matched an earlier handler. Registered LAST so API routes win.
mountWeb(app);

// 11. 404 handler — JSON, no HTML. The mount seam has already handled
//     non-/api misses with its own placeholder or the SvelteKit handler, so
//     anything that reaches here is a missed /api/* path.
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

// 12. Error handler — log with stack, return a stack-free JSON body in
//     production.
app.onError((err, c) => {
  const requestId = (c as unknown as { get(key: string): unknown }).get('requestId') as
    | string
    | undefined;
  logger.error({ err, requestId, path: c.req.path }, 'unhandled error');
  const body: { error: string; requestId?: string; detail?: string } = {
    error: 'internal_error',
  };
  if (requestId) body.requestId = requestId;
  if (config.NODE_ENV !== 'production') {
    body.detail = err instanceof Error ? err.message : String(err);
  }
  return c.json(body, 500);
});

const server: ServerType = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port, env: config.NODE_ENV }, 'server listening');
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  // 1. Close all SSE streams gracefully so clients receive a clean `close`
  //    frame instead of an EOF that triggers browser auto-reconnect.
  try {
    await closeAllStreams();
  } catch (err) {
    logger.warn({ err }, 'error closing SSE streams');
  }

  // 2. Stop accepting new connections and wait for in-flight handlers.
  server.close(() => {
    try {
      rawDb.close();
    } catch (err) {
      logger.warn({ err }, 'error closing database');
    }
    process.exit(0);
  });

  // Hard exit if graceful shutdown stalls.
  setTimeout(() => {
    logger.warn('graceful shutdown stalled; forcing exit');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export { app, server, shutdown };
