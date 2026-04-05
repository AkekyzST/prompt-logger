import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lte } from 'drizzle-orm';
import { authSessions, users } from '../../schema/index.js';
import { config } from '../config.js';
import { db } from '../db/client.js';

/**
 * Server-side session store.
 *
 * The raw token is a 32-byte opaque random value encoded as base64url. Only
 * its sha256 hex digest is ever written to the database — a DB compromise
 * does not reveal valid session cookies.
 *
 * Sliding expiry: every successful verify bumps `expires_at` to
 * `now + SESSION_TTL_DAYS`.
 */

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  role: 'admin' | 'viewer';
}

const TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function ttlMs(): number {
  return config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export interface CreatedAuthSession {
  token: string;
  expiresAt: Date;
}

export function createAuthSession(
  userId: string,
  userAgent: string | null,
  ip: string | null
): CreatedAuthSession {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs());
  db.insert(authSessions)
    .values({
      tokenHash,
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      userAgent,
      ip,
    })
    .run();
  return { token, expiresAt };
}

export interface VerifiedAuthSession {
  user: SessionUser;
  expiresAt: Date;
}

/**
 * Verify a cookie token. Returns the joined user row on success; null on any
 * failure (unknown token, expired). On success, slides expiry to now + TTL.
 */
export function verifyAuthSession(token: string): VerifiedAuthSession | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const tokenHash = hashSessionToken(token);
  const nowIso = new Date().toISOString();

  const row = db
    .select({
      tokenHash: authSessions.tokenHash,
      expiresAt: authSessions.expiresAt,
      userId: users.id,
      userEmail: users.email,
      userDisplayName: users.displayName,
      userRole: users.role,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, nowIso)))
    .get();

  if (!row) return null;

  const newExpiresAt = new Date(Date.now() + ttlMs());
  db.update(authSessions)
    .set({ expiresAt: newExpiresAt.toISOString() })
    .where(eq(authSessions.tokenHash, tokenHash))
    .run();

  return {
    user: {
      id: row.userId,
      email: row.userEmail,
      displayName: row.userDisplayName,
      role: row.userRole,
    },
    expiresAt: newExpiresAt,
  };
}

export function destroyAuthSession(token: string): void {
  if (typeof token !== 'string' || token.length === 0) return;
  const tokenHash = hashSessionToken(token);
  db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash)).run();
}

/**
 * Delete every expired session row. Safe to call from a periodic job; not
 * strictly required because verifyAuthSession already rejects expired rows.
 */
export function purgeExpiredSessions(): number {
  const nowIso = new Date().toISOString();
  const result = db.delete(authSessions).where(lte(authSessions.expiresAt, nowIso)).run();
  // drizzle's delete().run() returns a better-sqlite3 RunResult when the
  // driver supports it; cast through unknown for strictness.
  return (result as unknown as { changes?: number }).changes ?? 0;
}
