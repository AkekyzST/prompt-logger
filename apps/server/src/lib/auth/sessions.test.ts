import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authSessions, users } from '../../schema/index.js';
import { db, rawDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import {
  createAuthSession,
  destroyAuthSession,
  generateSessionToken,
  hashSessionToken,
  purgeExpiredSessions,
  verifyAuthSession,
} from './sessions.js';

/**
 * Unit tests for the server-side auth session store. Uses the in-memory
 * SQLite configured by test/setup-env.ts (DATABASE_PATH=":memory:").
 */

const TEST_USER_ID = 'oidc-sub-test-user';
const TEST_EMAIL = 'test-user@example.test';

beforeAll(() => {
  runMigrations(rawDb);
});

beforeEach(() => {
  db.delete(authSessions).run();
  db.delete(users).run();
  db.insert(users)
    .values({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      displayName: 'Test User',
      role: 'viewer',
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    })
    .run();
});

afterEach(() => {
  db.delete(authSessions).run();
});

describe('generateSessionToken / hashSessionToken', () => {
  it('generates base64url tokens of expected length', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toEqual(b);
    // 32 bytes → 43 base64url chars without padding.
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashSessionToken returns sha256 hex of the raw token', () => {
    const token = 'deterministic-token-value';
    const expected = createHash('sha256').update(token).digest('hex');
    expect(hashSessionToken(token)).toEqual(expected);
    expect(hashSessionToken(token)).toHaveLength(64);
  });
});

describe('createAuthSession / verifyAuthSession / destroyAuthSession', () => {
  it('round-trips a session and returns the joined user', () => {
    const { token, expiresAt } = createAuthSession(TEST_USER_ID, 'UA/1.0', '127.0.0.1');
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const verified = verifyAuthSession(token);
    expect(verified).not.toBeNull();
    expect(verified?.user.id).toEqual(TEST_USER_ID);
    expect(verified?.user.email).toEqual(TEST_EMAIL);
    expect(verified?.user.role).toEqual('viewer');
  });

  it('stores sha256(token) as token_hash, not the raw token', () => {
    const { token } = createAuthSession(TEST_USER_ID, null, null);
    const rows = db.select().from(authSessions).all();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) throw new Error('unreachable');
    expect(row.tokenHash).toEqual(hashSessionToken(token));
    expect(row.tokenHash).not.toEqual(token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it('rejects an unknown token', () => {
    expect(verifyAuthSession('totally-made-up-token')).toBeNull();
  });

  it('rejects an empty token without touching the DB', () => {
    expect(verifyAuthSession('')).toBeNull();
  });

  it('rejects an expired session and leaves the row in place', () => {
    const { token } = createAuthSession(TEST_USER_ID, null, null);
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    db.update(authSessions)
      .set({ expiresAt: pastIso })
      .where(eq(authSessions.tokenHash, hashSessionToken(token)))
      .run();

    expect(verifyAuthSession(token)).toBeNull();
  });

  it('slides expiry forward on successful verify', () => {
    const { token } = createAuthSession(TEST_USER_ID, null, null);
    const tokenHash = hashSessionToken(token);

    // Manually set expiry to 1 minute from now so we can observe the slide.
    const nearExpiry = new Date(Date.now() + 60_000).toISOString();
    db.update(authSessions)
      .set({ expiresAt: nearExpiry })
      .where(eq(authSessions.tokenHash, tokenHash))
      .run();

    const before = db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .get();
    expect(before?.expiresAt).toEqual(nearExpiry);

    const verified = verifyAuthSession(token);
    expect(verified).not.toBeNull();

    const after = db.select().from(authSessions).where(eq(authSessions.tokenHash, tokenHash)).get();
    expect(after?.expiresAt).toBeDefined();
    if (!after?.expiresAt) throw new Error('unreachable');
    expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(new Date(nearExpiry).getTime());
  });

  it('destroyAuthSession deletes the row so verify returns null', () => {
    const { token } = createAuthSession(TEST_USER_ID, null, null);
    expect(verifyAuthSession(token)).not.toBeNull();
    destroyAuthSession(token);
    expect(verifyAuthSession(token)).toBeNull();
    const rows = db.select().from(authSessions).all();
    expect(rows).toHaveLength(0);
  });

  it('destroyAuthSession is a no-op for unknown tokens', () => {
    createAuthSession(TEST_USER_ID, null, null);
    destroyAuthSession('not-a-real-token');
    expect(db.select().from(authSessions).all()).toHaveLength(1);
  });
});

describe('purgeExpiredSessions', () => {
  it('deletes only rows whose expires_at <= now', () => {
    const { token: liveToken } = createAuthSession(TEST_USER_ID, null, null);

    // Insert an expired row directly.
    const expiredHash = 'a'.repeat(64);
    db.insert(authSessions)
      .values({
        tokenHash: expiredHash,
        userId: TEST_USER_ID,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        userAgent: null,
        ip: null,
      })
      .run();

    expect(db.select().from(authSessions).all()).toHaveLength(2);
    purgeExpiredSessions();

    const remaining = db.select().from(authSessions).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.tokenHash).toEqual(hashSessionToken(liveToken));
  });
});
