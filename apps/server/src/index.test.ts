import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end smoke test for the fully-wired server.
 *
 * Boots the real app (the default export of src/index.ts) with test env
 * vars, hits every top-level route category, and verifies graceful
 * shutdown. This is the last line of defence before production.
 */

const TMP_DIR = mkdtempSync(join(tmpdir(), 'plog-smoke-'));
process.env.NODE_ENV = 'test';
// Pick a high ephemeral port; the serve() call in index.ts binds to it. We
// still use app.fetch for assertions so we do not care about the socket.
process.env.PORT = '34877';
process.env.PUBLIC_BASE_URL = 'http://localhost';
process.env.DATABASE_PATH = join(TMP_DIR, 'smoke.db');
process.env.INGEST_TOKEN = 'smoke-token-0123456789abcdef';
process.env.INGEST_RATE_LIMIT_PER_MIN = '1000';
process.env.INGEST_MAX_BODY_KB = '64';
process.env.OIDC_ISSUER = 'https://issuer.example.test';
process.env.OIDC_CLIENT_ID = 'smoke-client';
process.env.OIDC_CLIENT_SECRET = 'smoke-secret';
process.env.OIDC_REDIRECT_URI = 'http://localhost/auth/callback';
process.env.ADMIN_EMAILS = 'admin@example.test';
process.env.LOG_LEVEL = 'fatal';
process.env.SSE_HEARTBEAT_SECONDS = '60';
// Ensure no leftover PROMPT_LOGGER_WEB_HANDLER from another test file affects
// mountWeb's resolution.
process.env.PROMPT_LOGGER_WEB_HANDLER = join(TMP_DIR, 'definitely-not-there.js');

// Block the auth callback from making real HTTPS calls to issuer.example.test.
// arctic's OIDC discovery runs at /login, so we stub global fetch for the
// arctic discovery path only. Everything else is served by the app itself via
// app.fetch and never hits this stub.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith('https://issuer.example.test')) {
    return new Response(
      JSON.stringify({
        issuer: 'https://issuer.example.test',
        authorization_endpoint: 'https://issuer.example.test/authorize',
        token_endpoint: 'https://issuer.example.test/token',
        userinfo_endpoint: 'https://issuer.example.test/userinfo',
        jwks_uri: 'https://issuer.example.test/jwks',
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }
  return realFetch(input as Request, init);
}) as typeof fetch;

// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let app: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let server: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let shutdown: any;

beforeAll(async () => {
  const mod = await import('./index.js');
  app = mod.app;
  server = mod.server;
  shutdown = mod.shutdown;
});

afterAll(async () => {
  // Stop the Node server started as a side effect of importing index.ts.
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  globalThis.fetch = realFetch;
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('server smoke — top-level routes', () => {
  it('GET /healthz → 200 ok with db and version', async () => {
    const res = await app.fetch(new Request('http://localhost/healthz'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; db: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(typeof body.version).toBe('string');
    // Every response must carry a request id header.
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('POST /api/ingest unauthenticated → 401', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ claude_session_id: 'smk-1', prompt: 'hi' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('GET /api/me unauthenticated → 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/me'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/sessions unauthenticated → 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/admin/sessions'));
    expect(res.status).toBe(401);
  });

  it('GET /login → 302 redirect to the OIDC authorization endpoint', async () => {
    const res = await app.fetch(new Request('http://localhost/login'));
    expect([302, 303, 307]).toContain(res.status);
    const location = res.headers.get('location');
    expect(location).toBeTruthy();
    expect(location).toContain('issuer.example.test');
    // Flow cookie set.
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('pl_oidc=');
  });

  it('GET / → 503 placeholder HTML (no web build present)', async () => {
    const res = await app.fetch(new Request('http://localhost/'));
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type') ?? '').toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('Web UI not built');
  });

  it('GET /some-unknown-api-path → 401 (viewer sub-apps requireAuth wildcard)', async () => {
    // Every viewer route sub-app attaches `requireAuth` with a `*` matcher,
    // so any unmatched /api/* path returns 401 to an unauthenticated caller.
    // We do NOT want to 404 here — telling unauthenticated clients which API
    // paths exist would be an information leak.
    const res = await app.fetch(new Request('http://localhost/api/does-not-exist'));
    expect(res.status).toBe(401);
  });
});

describe('server smoke — graceful shutdown', () => {
  it('shutdown() completes within 2s without throwing', async () => {
    // Install a fake process.exit so shutdown does not kill vitest. The real
    // server.close() path still runs; we only intercept the terminal exit.
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      return undefined as never;
    }) as typeof process.exit;

    try {
      const start = Date.now();
      await shutdown('TEST');
      // Give the server.close callback a tick to run (it calls exit()).
      await new Promise((r) => setTimeout(r, 100));
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
      expect(exitCode).toBe(0);
    } finally {
      process.exit = originalExit;
    }
  });
});
