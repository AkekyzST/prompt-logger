import { type ServerLoad, error, redirect } from '@sveltejs/kit';

/**
 * Admin route group gate. The root layout already redirects unauthenticated
 * users to `/login`, but we re-check here as a belt-and-braces guard so
 * someone hitting `/admin/*` via prerender, intermediary cache, or a
 * forgotten bookmark still gets the right outcome.
 *
 * - `user === null`  → redirect to `/login`
 * - `user.role !== 'admin'` → 403 Forbidden (never leak existence via 404)
 * - otherwise → hydrate `user` onto the admin page data
 */
export const load: ServerLoad = ({ locals }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }
  if (locals.user.role !== 'admin') {
    throw error(403, 'Forbidden');
  }
  return { user: locals.user };
};
