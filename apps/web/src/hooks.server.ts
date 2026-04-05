import type { Handle } from '@sveltejs/kit';

/**
 * Reads the `pl_theme` cookie to decide whether to render `<html class="dark">`
 * on the server — this prevents a light/dark flash on first paint without any
 * inline script (keeps CSP strict).
 *
 * The `/api/me` call that populates `event.locals.user` lands in Phase 2.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const cookieTheme = event.cookies.get('pl_theme');
  const theme: App.Locals['theme'] =
    cookieTheme === 'dark' || cookieTheme === 'light' || cookieTheme === 'system'
      ? cookieTheme
      : 'system';

  event.locals.theme = theme;
  event.locals.user = null;

  const htmlClass = theme === 'dark' ? 'dark' : '';

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%sveltekit.theme%', htmlClass),
  });
};
