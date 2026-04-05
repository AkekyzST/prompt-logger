import { type ServerType, serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './lib/config.js';
import { rawDb } from './lib/db/client.js';
import { runMigrations } from './lib/db/migrate.js';
import { logger } from './lib/logger.js';

const VERSION = process.env.GIT_SHA ?? 'dev';

// Run migrations before accepting traffic. Fail-fast on error.
try {
  runMigrations();
} catch (err) {
  logger.fatal({ err }, 'failed to run migrations');
  process.exit(1);
}

const app = new Hono();

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
