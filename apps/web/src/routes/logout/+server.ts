import { apiFetch } from '$lib/api/client.js';
import { type RequestHandler, redirect } from '@sveltejs/kit';

/**
 * POST /logout — called from the top-bar user menu's form action.
 *
 * 1. Forwards the request (with its session cookie) to the API's POST /logout
 *    so the server-side session row is destroyed.
 * 2. Clears the local cookie defensively — the API also issues a Set-Cookie
 *    clearing the value, but we're serving from a different path in dev.
 * 3. Bounces the browser to /login which kicks off OIDC again.
 */
export const POST: RequestHandler = async (event) => {
  try {
    await apiFetch(event, '/logout', { method: 'POST' });
  } catch {
    // Network/server failure — proceed with local cleanup regardless.
  }

  event.cookies.delete('pl_sess', { path: '/' });

  throw redirect(303, '/login');
};
