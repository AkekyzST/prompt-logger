import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from './session.js';

/**
 * Reject any request whose attached user is not an admin. Must be chained
 * AFTER the session middleware and AFTER requireAuth — callers that want
 * admin-only routes should mount `requireAuth` then `requireAdmin`.
 *
 * 401 for unauthenticated; 403 for authenticated-but-not-admin. The two
 * codes are distinguished because clients handle them differently (login
 * vs. "ask an admin").
 */
export const requireAdmin: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'unauthenticated' }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'forbidden' }, 403);
  }
  await next();
};
