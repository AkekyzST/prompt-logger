import { type ServerLoad, redirect } from '@sveltejs/kit';

/**
 * Public landing page reached by unauthenticated visitors who hit a shared
 * link. Bypasses the `+layout.server.ts` auth gate (see the route-matcher
 * there). If the visitor is already authenticated, send them home.
 */
export const load: ServerLoad = ({ locals }) => {
  if (locals.user) {
    throw redirect(302, '/');
  }
  return {};
};
