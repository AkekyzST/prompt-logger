import { apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type { JoinResponse } from '$lib/api/types.js';
import { type ServerLoad, redirect } from '@sveltejs/kit';

/**
 * GET /join/:code — shareable auto-redeem link.
 *
 * Logged-in users: POSTs to /api/join immediately and redirects to /c/:tag.
 * Unauthenticated users: writes a short-lived `pl_pending_code` cookie and
 * redirects to /login. After the OIDC round-trip, hooks.server.ts (or the
 * root layout) picks up the cookie, finishes the redemption, and clears it.
 */
const PENDING_COOKIE = 'pl_pending_code';
const FIVE_MINUTES = 60 * 5;

export const load: ServerLoad = async (event) => {
  const rawCode = event.params.code ?? '';
  const code = rawCode.trim();
  if (!code) throw redirect(302, '/join');

  if (!event.locals.user) {
    event.cookies.set(PENDING_COOKIE, code, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !event.url.hostname.match(/^(localhost|127\.0\.0\.1)$/),
      maxAge: FIVE_MINUTES,
    });
    throw redirect(302, '/login');
  }

  try {
    const res = await apiJson<JoinResponse>(event, '/api/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    throw redirect(303, `/c/${encodeURIComponent(res.tag)}?joined=${encodeURIComponent(res.tag)}`);
  } catch (err) {
    if (isApiError(err) && err.status === 404) {
      throw redirect(303, '/join?error=unknown_code');
    }
    throw err;
  }
};
