import { dev } from '$app/environment';
import { apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type { MeResponse } from '$lib/api/types.js';
import type { Handle, HandleFetch } from '@sveltejs/kit';
import type { AppUser } from './app.d.ts';

const API_ORIGIN_DEV =
  (typeof import.meta.env !== 'undefined'
    ? (import.meta.env.VITE_API_ORIGIN as string | undefined)
    : undefined) ?? 'http://localhost:3000';

/**
 * Root server hook:
 *
 * 1. Reads the `pl_theme` cookie and injects the `dark` class into `<html>`
 *    via `transformPageChunk` so the first paint matches the stored theme
 *    (no FOUC, no inline script, CSP-clean).
 * 2. If a `pl_sess` cookie is present, calls `GET /api/me` once per request
 *    and hydrates `event.locals.user`. Network / 401 failures degrade to
 *    `user = null`; the per-route layout guard decides whether to redirect.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const cookieTheme = event.cookies.get('pl_theme');
  const theme: App.Locals['theme'] =
    cookieTheme === 'dark' || cookieTheme === 'light' || cookieTheme === 'system'
      ? cookieTheme
      : 'system';

  event.locals.theme = theme;
  event.locals.user = null;

  const sessionCookie = event.cookies.get('pl_sess');
  if (sessionCookie) {
    try {
      const me = await apiJson<MeResponse>(
        { request: event.request, fetch: event.fetch },
        '/api/me'
      );
      const user: AppUser = {
        id: me.id,
        email: me.email,
        displayName: me.displayName,
        role: me.role,
        accessibleSessionCount: me.accessibleSessionCount,
        accessibleTagCount: me.accessibleTagCount,
      };
      event.locals.user = user;
    } catch (err) {
      if (isApiError(err) && err.status !== 401) {
        // Log non-auth failures in dev so misconfigured API origins don't
        // silently degrade to "logged out".
        if (dev) console.warn('[hooks.server] /api/me failed:', err.status, err.message);
      }
      event.locals.user = null;
    }
  }

  const htmlClass = theme === 'dark' ? 'dark' : '';

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%sveltekit.theme%', htmlClass),
  });
};

/**
 * In dev, `event.fetch` with an absolute URL to the API origin is rewritten
 * to a relative path against the SvelteKit dev server by default. Rewrite it
 * back so the request actually hits the Hono API on its own port, and
 * forward the incoming cookie jar so the session survives the hop.
 */
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  if (dev && request.url.startsWith(API_ORIGIN_DEV)) {
    const cookie = event.request.headers.get('cookie');
    if (cookie && !request.headers.has('cookie')) {
      request.headers.set('cookie', cookie);
    }
  }
  return fetch(request);
};
