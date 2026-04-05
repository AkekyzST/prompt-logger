import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Seed env BEFORE dynamically importing any module-under-test. config.ts
// validates env at import time, so static imports would load config with the
// wrong values. See routes/ingest.ts and lib/config.ts.

const TMP_DIR = mkdtempSync(join(tmpdir(), 'plog-ingest-'));
process.env.NODE_ENV = 'test';
process.env.PORT = '3100';
process.env.PUBLIC_BASE_URL = 'http://localhost';
process.env.DATABASE_PATH = join(TMP_DIR, 'ingest.db');
process.env.INGEST_TOKEN = 'test-token-0123456789abcdef';
process.env.INGEST_RATE_LIMIT_PER_MIN = '3';
process.env.INGEST_MAX_BODY_KB = '1';
process.env.OIDC_ISSUER = 'https://example.com';
process.env.OIDC_CLIENT_ID = 'cid';
process.env.OIDC_CLIENT_SECRET = 'csec';
process.env.OIDC_REDIRECT_URI = 'http://localhost/auth/callback';
process.env.ADMIN_EMAILS = 'a@b.c';
process.env.LOG_LEVEL = 'fatal';

const TOKEN = process.env.INGEST_TOKEN;

// Deferred module handles populated in beforeAll().
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let app: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let db: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let rawDb: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let sessions: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let prompts: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let eq: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let emittersForTest: any;
// biome-ignore lint/suspicious/noExplicitAny: dynamic imports
let safeEqual: any;

function post(body: unknown, headers: Record<string, string> = {}) {
  return app.fetch(
    new Request('http://localhost/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

beforeAll(async () => {
  const { runMigrations } = await import('../lib/db/migrate.js');
  const client = await import('../lib/db/client.js');
  db = client.db;
  rawDb = client.rawDb;
  const schema = await import('../schema/index.js');
  sessions = schema.sessions;
  prompts = schema.prompts;
  eq = (await import('drizzle-orm')).eq;
  const { Hono } = await import('hono');
  const { ingestRoutes } = await import('./ingest.js');
  const em = await import('../lib/emitter.js');
  emittersForTest = em._emittersForTest;
  safeEqual = (await import('../middleware/bearerAuth.js')).safeEqual;

  runMigrations();
  app = new Hono();
  app.route('/api', ingestRoutes);
});

afterAll(() => {
  try {
    rawDb?.close();
  } catch {
    /* ignore */
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('safeEqual (constant-time bearer compare)', () => {
  it('returns true only when buffers have identical bytes and lengths', () => {
    expect(safeEqual(Buffer.from('abcd'), Buffer.from('abcd'))).toBe(true);
    expect(safeEqual(Buffer.from('abcd'), Buffer.from('abce'))).toBe(false);
    expect(safeEqual(Buffer.from('abcd'), Buffer.from('abcdef'))).toBe(false);
    expect(safeEqual(Buffer.from(''), Buffer.from(''))).toBe(true);
  });
});

describe('POST /api/ingest — auth', () => {
  it('401 without Authorization header', async () => {
    const res = await post({ claude_session_id: 'auth-1', prompt: 'hi' });
    expect(res.status).toBe(401);
  });

  it('401 with wrong bearer token of same length', async () => {
    const wrong = 'X'.repeat(TOKEN.length);
    const res = await post(
      { claude_session_id: 'auth-2', prompt: 'hi' },
      { authorization: `Bearer ${wrong}` }
    );
    expect(res.status).toBe(401);
  });

  it('401 with wrong bearer token of different length', async () => {
    const res = await post(
      { claude_session_id: 'auth-3', prompt: 'hi' },
      { authorization: 'Bearer short' }
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/ingest — bodyLimit', () => {
  it('413 when body exceeds INGEST_MAX_BODY_KB', async () => {
    const huge = 'x'.repeat(2 * 1024); // 2 KB > 1 KB limit
    const res = await post(
      { claude_session_id: 'big', prompt: huge },
      { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '198.51.100.1' }
    );
    expect(res.status).toBe(413);
  });
});

describe('POST /api/ingest — rate limit', () => {
  it('429 after bucket is exhausted', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await post(
        { claude_session_id: `rl-${i}`, prompt: 'hi' },
        { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '203.0.113.7' }
      );
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 201).length).toBeGreaterThanOrEqual(3);
    expect(statuses).toContain(429);
  });
});

describe('POST /api/ingest — happy path', () => {
  it('creates a private session, redacts secrets, stores raw_hash, emits exactly one prompt event', async () => {
    const claudeSid = 'happy-1';
    const secret = 'sk-ant-abcDEF123456_ghiJKLmnoPQRstuVWXyz';
    const prompt = `please help with ${secret} thanks`;

    const prevKeys = new Set((emittersForTest() as Map<string, unknown>).keys());
    let count = 0;
    const patched = patchEmitCounter((ev) => {
      if (ev === 'prompt') count += 1;
    });

    try {
      const res = await post(
        { claude_session_id: claudeSid, cwd: '/tmp', prompt },
        { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '198.51.100.10' }
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; seq: number };
      expect(body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(body.seq).toBe(1);

      const sess = db.select().from(sessions).where(eq(sessions.claudeSessionId, claudeSid)).get();
      expect(sess).toBeTruthy();
      expect(sess?.visibility).toBe('private');
      expect(sess?.cwd).toBe('/tmp');

      const stored = db.select().from(prompts).where(eq(prompts.id, body.id)).get();
      expect(stored).toBeTruthy();
      expect(stored?.content).toContain('[REDACTED:ai-key]');
      expect(stored?.content).not.toContain(secret);
      expect(stored?.rawHash).toMatch(/^[a-f0-9]{64}$/);
      const hits = JSON.parse(stored?.redactions ?? '[]') as Array<{ type: string; count: number }>;
      expect(hits.find((h) => h.type === 'ai-key')?.count).toBe(1);

      expect(count).toBe(1);

      const newKeys = [...(emittersForTest() as Map<string, unknown>).keys()].filter(
        (k) => !prevKeys.has(k)
      );
      expect(newKeys).toHaveLength(1);
    } finally {
      patched.restore();
    }
  });

  it('appends to the same session on subsequent prompts with the same claude_session_id', async () => {
    const claudeSid = 'append-1';
    const first = await post(
      { claude_session_id: claudeSid, prompt: 'first' },
      { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '198.51.100.11' }
    );
    const second = await post(
      { claude_session_id: claudeSid, prompt: 'second' },
      { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': '198.51.100.11' }
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const b1 = (await first.json()) as { seq: number };
    const b2 = (await second.json()) as { seq: number };
    expect(b1.seq).toBe(1);
    expect(b2.seq).toBe(2);
  });
});

// --- helpers ---

/**
 * Patch EventEmitter.prototype.emit to count events. Returns a `restore`
 * handle that reverts the patch. Scoped to a single test via try/finally.
 */
function patchEmitCounter(tap: (event: string) => void) {
  // biome-ignore lint/suspicious/noExplicitAny: test-only prototype patch
  const { EventEmitter } = require('node:events') as any;
  const proto = EventEmitter.prototype;
  const original = proto.emit;
  // biome-ignore lint/suspicious/noExplicitAny: test-only prototype patch
  proto.emit = function patched(this: unknown, event: string, ...args: any[]) {
    try {
      tap(event);
    } catch {
      /* ignore tap errors */
    }
    return original.call(this, event, ...args);
  };
  return {
    restore() {
      proto.emit = original;
    },
  };
}
