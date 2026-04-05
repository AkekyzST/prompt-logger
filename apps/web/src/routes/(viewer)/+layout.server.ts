import type { ServerLoad } from '@sveltejs/kit';

/**
 * Viewer route group layout. Admin and viewer roles both pass — the root
 * layout already redirects unauthenticated users to /login, so there is no
 * extra gate here. Kept as an explicit file so SvelteKit recognises the
 * `(viewer)` group and route-level loads can still compose with the root.
 */
export const load: ServerLoad = ({ locals }) => {
  return { user: locals.user };
};
