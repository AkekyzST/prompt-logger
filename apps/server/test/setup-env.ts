/**
 * Vitest global setup: populate the environment with test-safe defaults before
 * `src/lib/config.ts` is imported. Any test that needs different values can
 * override them per-test (and restore in afterEach).
 *
 * Keep this file import-free — it runs in the worker bootstrap phase.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  DATABASE_PATH: ':memory:',
  INGEST_TOKEN: 'test-ingest-token-0123456789abcdef',
  OIDC_ISSUER: 'https://example.test',
  OIDC_CLIENT_ID: 'test-client',
  OIDC_CLIENT_SECRET: 'test-secret',
  OIDC_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  ADMIN_EMAILS: 'admin@example.test',
  LOG_LEVEL: 'fatal',
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
