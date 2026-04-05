import { apiFetch, apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type { PaginatedSessions } from '$lib/api/types.js';
import { type Actions, type ServerLoad, fail } from '@sveltejs/kit';

/**
 * GET /admin/sessions — paginated + searchable session list.
 *
 * Query params are the same as the server's `/api/admin/sessions` endpoint so
 * the URL is a faithful mirror of what's being displayed. `availableTags` is
 * computed from the returned page (no dedicated tags endpoint yet — deferred
 * to plan 004 with a TODO).
 */
export const load: ServerLoad = async (event) => {
  const q = event.url.searchParams.get('q')?.trim() ?? '';
  const tag = event.url.searchParams.get('tag')?.trim() ?? '';
  const cursor = event.url.searchParams.get('cursor')?.trim() ?? '';

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tag) params.set('tag', tag);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  const path = `/api/admin/sessions${query ? `?${query}` : ''}`;

  const page = await apiJson<PaginatedSessions>(event, path);

  // TODO(plan-004): swap for GET /api/admin/tags once the server exposes it.
  const availableTags = Array.from(
    new Set(page.sessions.map((s) => s.tag).filter((t): t is string => !!t))
  ).sort();

  return {
    sessions: page.sessions,
    nextCursor: page.nextCursor ?? null,
    q,
    tag,
    availableTags,
  };
};

/**
 * Bulk actions iterate one-request-per-row on purpose: the server has no
 * batch endpoint and the CLAUDE.md guidance says "iterate via a progress
 * bar, sending one request per item". We collect successes and failures so
 * the page can show a partial-result banner if any of them trip.
 */
export const actions: Actions = {
  bulkSetVisibility: async (event) => {
    const form = await event.request.formData();
    const visibility = String(form.get('visibility') ?? '').trim();
    const ids = form.getAll('ids').map((v) => String(v));
    if (!['private', 'shared', 'code'].includes(visibility) || ids.length === 0) {
      return fail(400, { error: 'Select rows and a visibility.' });
    }
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await apiFetch(event, `/api/admin/sessions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ visibility }),
        });
      } catch (err) {
        failures.push(id);
        if (!isApiError(err)) throw err;
      }
    }
    return { bulk: { applied: ids.length - failures.length, failed: failures.length } };
  },
  bulkDelete: async (event) => {
    const form = await event.request.formData();
    const ids = form.getAll('ids').map((v) => String(v));
    if (ids.length === 0) {
      return fail(400, { error: 'Select at least one row.' });
    }
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await apiFetch(event, `/api/admin/sessions/${id}`, { method: 'DELETE' });
      } catch (err) {
        failures.push(id);
        if (!isApiError(err)) throw err;
      }
    }
    return { bulk: { applied: ids.length - failures.length, failed: failures.length } };
  },
};
