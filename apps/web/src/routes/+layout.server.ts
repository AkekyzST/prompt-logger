import { type ServerLoad, redirect } from '@sveltejs/kit';

/**
 * Routes that bypass the auth gate. `/login-landing` is a static marketing
 * page for unauthenticated visitors; `/join/:code` needs to capture the code
 * BEFORE kicking the user through OIDC so the post-login redirect lands
 * them on the right tag.
 */
const PUBLIC_ROUTE_PATTERNS: ReadonlyArray<RegExp> = [
  /^\/login-landing(\/.*)?$/,
  /^\/join\/[^/]+\/?$/,
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

export const load: ServerLoad = ({ locals, url }) => {
  if (!locals.user && !isPublicRoute(url.pathname)) {
    // 302 to the API's /login which kicks off the OIDC flow. Since the UI is
    // mounted same-origin by the server in production, a plain path is fine;
    // in dev the browser still hits /login on the SvelteKit dev server which
    // the developer should proxy (or visit the API origin directly). The
    // redirect target is chosen to match the prod topology.
    throw redirect(302, '/login');
  }

  return {
    user: locals.user,
    theme: locals.theme,
  };
};
