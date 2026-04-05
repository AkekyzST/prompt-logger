import { apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type { SessionWithPrompts } from '$lib/api/types.js';
import { type ServerLoad, error } from '@sveltejs/kit';

/**
 * GET /s/:sessionId — SSR-first session viewer.
 *
 * Calls `GET /api/sessions/:id` with the forwarded cookie. Per the server
 * contract, 403 and 404 are indistinguishable (no existence leak), so both
 * map to a local 404 here. Any other API error bubbles as 500.
 */
export const load: ServerLoad = async (event) => {
  const sessionId = event.params.sessionId;
  if (!sessionId) throw error(404, 'not found');

  try {
    const data = await apiJson<SessionWithPrompts>(event, `/api/sessions/${sessionId}`);
    return {
      session: data.session,
      prompts: data.prompts,
      user: event.locals.user,
    };
  } catch (err) {
    if (isApiError(err) && (err.status === 403 || err.status === 404)) {
      throw error(404, 'not found');
    }
    throw err;
  }
};
