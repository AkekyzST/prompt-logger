import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { type SessionUser, verifyAuthSession } from '../lib/auth/sessions.js';
import { config } from '../lib/config.js';

/**
 * Hono context variables populated by this middleware.
 *
 * The session middleware is non-rejecting by design: unauthenticated routes
 * (/login, /auth/callback, /logout, /healthz) still want to run. Route-level
 * guards (requireAuth, requireAdmin) are responsible for 401/403 responses.
 */
export type AuthVariables = {
  user: SessionUser | undefined;
};

export type AuthContext = Context<{ Variables: AuthVariables }>;

export const sessionMiddleware: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next
) => {
  const token = getCookie(c, config.SESSION_COOKIE_NAME);
  if (token) {
    const verified = verifyAuthSession(token);
    if (verified) {
      c.set('user', verified.user);
    }
  }
  await next();
};
