import { type ServerLoad, redirect } from '@sveltejs/kit';

/**
 * Viewer landing. Admins bounce straight to /admin (Phase 4). Viewers see a
 * lightweight summary built from the /api/me counts that hooks.server.ts
 * already loaded — no extra API calls, no loading spinners.
 *
 * A per-user "my accessible sessions" endpoint is tracked for plan 004; until
 * then the landing is intentionally sparse rather than leaking the admin list.
 */
export const load: ServerLoad = ({ locals }) => {
  if (locals.user?.role === 'admin') {
    throw redirect(302, '/admin');
  }
  return { user: locals.user };
};
