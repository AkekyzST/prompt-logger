import { type ServerLoad, redirect } from '@sveltejs/kit';

/**
 * /me profile page. The user object is already loaded by hooks.server.ts via
 * /api/me so this loader simply forwards it. Unauthenticated visitors are
 * already redirected to /login by the root +layout.server.ts gate.
 */
export const load: ServerLoad = ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  return { user: locals.user };
};
