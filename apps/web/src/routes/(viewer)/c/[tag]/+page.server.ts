import { apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type { PaginatedSessions, Session } from '$lib/api/types.js';
import { type ServerLoad, error } from '@sveltejs/kit';

/**
 * GET /c/:tag — class tag view.
 *
 * Lists sessions accessible to the current user for this tag. Implementation
 * note: the server currently exposes only `/api/admin/sessions?tag=` (admin-
 * only) — a public viewer listing endpoint is tracked for plan 004 so the
 * scope of this phase stays bounded. Until that lands:
 *
 *   - Admins get the full list via the admin endpoint.
 *   - Viewers see the tag header and a "list coming soon" affordance. Their
 *     access is still enforced by canViewSession on each direct-link load, so
 *     no session data leaks here.
 *
 * TODO(plan-004): replace the viewer branch with a GET /api/tags/:tag/sessions
 * call once the endpoint exists.
 */
export const load: ServerLoad = async (event) => {
  const tag = event.params.tag;
  if (!tag) throw error(404, 'not found');

  const user = event.locals.user;
  let sessions: Session[] = [];
  let listingSupported = false;

  if (user?.role === 'admin') {
    try {
      const res = await apiJson<PaginatedSessions>(
        event,
        `/api/admin/sessions?tag=${encodeURIComponent(tag)}`
      );
      sessions = res.sessions;
      listingSupported = true;
    } catch (err) {
      if (!isApiError(err)) throw err;
      // Admin listing failed — fall through to the empty-state view.
    }
  }

  return { tag, sessions, listingSupported, user };
};
