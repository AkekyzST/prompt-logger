import { type ServerType, serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './lib/config.js';
import { rawDb } from './lib/db/client.js';
import { runMigrations } from './lib/db/migrate.js';
import { logger } from './lib/logger.js';
import { sessionMiddleware } from './middleware/session.js';
import { authRoutes } from './routes/auth.js';
import { ingestRoutes } from './routes/ingest.js';
import { joinRoutes } from './routes/join.js';
import { meRoutes } from './routes/me.js';
import { sessionRoutes } from './routes/sessions.js';

const VERSION = process.env.GIT_SHA ?? 'dev';

// Run migrations before accepting traffic. Fail-fast on error.
try {
  runMigrations();
} catch (err) {
  logger.fatal({ err }, 'failed to run migrations');
  process.exit(1);
}

const app = new Hono();

// Populate c.get('user') from the session cookie on every request. Does not
// reject; route-level guards are responsible for 401/403.
app.use('*', sessionMiddleware);

app.route('/', authRoutes);
app.route('/api', ingestRoutes);
app.route('/api', meRoutes);
app.route('/api', sessionRoutes);
app.route('/api', joinRoutes);

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

const server: ServerType = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info({ port: info.port, env: config.NODE_ENV }, 'server listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    try {
      rawDb.close();
    } catch (err) {
      logger.warn({ err }, 'error closing database');
    }
    process.exit(0);
  });
  // Hard exit if graceful shutdown stalls.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
