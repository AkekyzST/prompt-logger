import { sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import type { SessionUser } from '../lib/auth/sessions.js';
import { db } from '../lib/db/client.js';
import type { AuthVariables } from './session.js';

/**
 * Canonical access control for Prompt Logger.
 *
 * This file exports the ONE access-check query defined in
 * docs/ARCHITECTURE.md §5. Every route that returns session data must call
 * {@link canViewSession}. No route may reimplement this check.
 *
 * Admin users bypass visibility rules. Shared sessions require an explicit
 * session_grants row. Code-visibility sessions require the caller to have
 * redeemed a class_code whose tag matches the session's tag and whose
 * expiry (if set) has not yet passed.
 */

/**
 * Returns true if the user is allowed to view the given session.
 *
 * Implemented as a single SQL statement so there is no possibility of a
 * TOCTOU gap between subqueries.
 */
export function canViewSession(
  userId: string,
  userRole: 'admin' | 'viewer',
  sessionId: string
): boolean {
  const nowIso = new Date().toISOString();
  const row = db.get<{ ok: number }>(sql`
      SELECT 1 AS ok FROM sessions s WHERE s.id = ${sessionId} AND (
        ${userRole} = 'admin'
        OR (s.visibility = 'shared' AND EXISTS (
          SELECT 1 FROM session_grants g
          WHERE g.session_id = s.id AND g.user_id = ${userId}
        ))
        OR (s.visibility = 'code' AND EXISTS (
          SELECT 1 FROM code_redemptions r
          JOIN class_codes c ON c.code = r.code
          WHERE r.user_id = ${userId}
            AND c.tag = s.tag
            AND (c.expires_at IS NULL OR c.expires_at > ${nowIso})
        ))
      )
    `);
  return row !== undefined && row.ok === 1;
}

/**
 * Assert that a user is present on the Hono context. Returns the user or
 * throws a response-like object via Hono's short-circuit mechanism.
 *
 * Kept as a helper (not a middleware) so that routes can short-circuit with
 * a single line: `const user = requireUser(c); if (!user) return ...`.
 */
export function getUser(c: Context<{ Variables: AuthVariables }>): SessionUser | undefined {
  return c.get('user');
}

/**
 * Hono middleware that rejects unauthenticated requests with 401. Routes
 * that need to be authenticated-only should attach this before their
 * handler.
 */
export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'unauthenticated' }, 401);
  }
  await next();
};
