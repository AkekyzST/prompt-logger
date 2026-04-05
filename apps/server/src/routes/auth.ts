import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createAuthSession, destroyAuthSession } from '../lib/auth/sessions.js';
import { config } from '../lib/config.js';
import { db } from '../lib/db/client.js';
import { logger } from '../lib/logger.js';
import {
  createAuthorizationURL,
  fetchUserInfo,
  generateCodeVerifier,
  generateState,
  validateAuthorizationCode,
} from '../lib/oidc.js';
import type { AuthVariables } from '../middleware/session.js';
import { users } from '../schema/index.js';

/**
 * OIDC login, callback, logout routes. Generic OIDC only — provider is
 * configured entirely via env vars. PKCE is mandatory.
 *
 * The state/codeVerifier pair is stored in a short-lived HttpOnly cookie
 * (5 minutes) instead of a server-side store, which keeps the flow stateless
 * for the out-of-band steps.
 */

const OIDC_COOKIE = 'pl_oidc';
const OIDC_COOKIE_TTL_SECONDS = 300;

interface OidcFlowCookie {
  state: string;
  codeVerifier: string;
}

const isSecureCookie = config.NODE_ENV === 'production';

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureCookie,
    sameSite: 'Lax' as const,
    path: '/',
  };
}

export const authRoutes = new Hono<{ Variables: AuthVariables }>();

authRoutes.get('/login', async (c) => {
  try {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await createAuthorizationURL(state, codeVerifier);

    const flow: OidcFlowCookie = { state, codeVerifier };
    setCookie(c, OIDC_COOKIE, JSON.stringify(flow), {
      ...baseCookieOptions(),
      maxAge: OIDC_COOKIE_TTL_SECONDS,
    });

    return c.redirect(url.toString(), 302);
  } catch (err) {
    logger.error({ err }, 'login: failed to build authorization URL');
    return c.json({ error: 'login_unavailable' }, 500);
  }
});

authRoutes.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const stateParam = c.req.query('state');
  const errParam = c.req.query('error');

  if (errParam) {
    logger.warn({ err: errParam }, 'OIDC callback returned error');
    return c.json({ error: 'oidc_error', detail: errParam }, 400);
  }
  if (!code || !stateParam) {
    return c.json({ error: 'missing_code_or_state' }, 400);
  }

  const rawFlow = getCookie(c, OIDC_COOKIE);
  if (!rawFlow) {
    return c.json({ error: 'missing_flow_cookie' }, 400);
  }
  deleteCookie(c, OIDC_COOKIE, baseCookieOptions());

  let flow: OidcFlowCookie;
  try {
    const parsed = JSON.parse(rawFlow) as Partial<OidcFlowCookie>;
    if (typeof parsed.state !== 'string' || typeof parsed.codeVerifier !== 'string') {
      throw new Error('flow cookie shape invalid');
    }
    flow = { state: parsed.state, codeVerifier: parsed.codeVerifier };
  } catch (err) {
    logger.warn({ err }, 'auth/callback: malformed flow cookie');
    return c.json({ error: 'malformed_flow_cookie' }, 400);
  }

  if (stateParam !== flow.state) {
    return c.json({ error: 'state_mismatch' }, 400);
  }

  let userInfoAccessToken: string;
  try {
    const tokens = await validateAuthorizationCode(code, flow.codeVerifier);
    userInfoAccessToken = tokens.accessToken();
  } catch (err) {
    logger.warn({ err }, 'auth/callback: code exchange failed');
    return c.json({ error: 'code_exchange_failed' }, 400);
  }

  let userInfo: Awaited<ReturnType<typeof fetchUserInfo>>;
  try {
    userInfo = await fetchUserInfo(userInfoAccessToken);
  } catch (err) {
    logger.warn({ err }, 'auth/callback: userinfo fetch failed');
    return c.json({ error: 'userinfo_failed' }, 400);
  }

  const nowIso = new Date().toISOString();
  const existing = db.select().from(users).where(eq(users.id, userInfo.sub)).get();

  if (!existing) {
    // First login: assign role by allowlist. Subsequent logins do NOT re-check.
    const isAdmin = config.ADMIN_EMAILS.includes(userInfo.email);
    db.insert(users)
      .values({
        id: userInfo.sub,
        email: userInfo.email,
        displayName: userInfo.name ?? null,
        role: isAdmin ? 'admin' : 'viewer',
        createdAt: nowIso,
        lastLoginAt: nowIso,
      })
      .run();
    logger.info(
      { sub: userInfo.sub, email: userInfo.email, role: isAdmin ? 'admin' : 'viewer' },
      'user provisioned'
    );
  } else {
    db.update(users)
      .set({
        email: userInfo.email,
        displayName: userInfo.name ?? existing.displayName,
        lastLoginAt: nowIso,
      })
      .where(eq(users.id, userInfo.sub))
      .run();
  }

  const userAgent = c.req.header('user-agent') ?? null;
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || null;

  const { token, expiresAt } = createAuthSession(userInfo.sub, userAgent, ip);

  const maxAgeSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  setCookie(c, config.SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    maxAge: maxAgeSeconds,
  });

  return c.redirect('/', 302);
});

authRoutes.post('/logout', (c) => {
  const token = getCookie(c, config.SESSION_COOKIE_NAME);
  if (token) {
    destroyAuthSession(token);
  }
  deleteCookie(c, config.SESSION_COOKIE_NAME, baseCookieOptions());
  return c.body(null, 204);
});
