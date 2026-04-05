import { apiFetch, apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type {
  PaginatedUsers,
  Session,
  SessionGrant,
  SessionWithPrompts,
  User,
} from '$lib/api/types.js';
import { type Actions, type ServerLoad, error, fail, redirect } from '@sveltejs/kit';

/**
 * Admin single-session editor.
 *
 * Loads the session + prompts via the admin endpoint. Grants are fetched
 * alongside by enriching each grant userId with the matching user row from
 * the admin users list (small N; no dedicated `grants with users` endpoint
 * on the server yet).
 */

interface AdminSessionDetail {
  session: Session;
  prompts: SessionWithPrompts['prompts'];
  grants: { userId: string; email: string | null; displayName: string | null }[];
}

export const load: ServerLoad = async (event) => {
  const id = event.params.id;
  if (!id) throw error(404, 'not found');

  let detail: SessionWithPrompts & { grants?: SessionGrant[] };
  try {
    detail = await apiJson<SessionWithPrompts & { grants?: SessionGrant[] }>(
      event,
      `/api/admin/sessions/${id}`
    );
  } catch (err) {
    if (isApiError(err) && err.status === 404) throw error(404, 'not found');
    throw err;
  }

  // Enrich grants with user emails via the admin users list.
  let users: User[] = [];
  try {
    const usersPage = await apiJson<PaginatedUsers>(event, '/api/admin/users?limit=200');
    users = usersPage.users;
  } catch {
    // Non-fatal: grants still render with raw ids.
  }
  const userById = new Map(users.map((u) => [u.id, u]));

  const rawGrants = detail.grants ?? [];
  const grants: AdminSessionDetail['grants'] = rawGrants.map((g) => {
    const u = userById.get(g.userId);
    return {
      userId: g.userId,
      email: u?.email ?? null,
      displayName: u?.displayName ?? null,
    };
  });

  return {
    session: detail.session,
    prompts: detail.prompts,
    grants,
  };
};

export const actions: Actions = {
  update: async (event) => {
    const form = await event.request.formData();
    const title = String(form.get('title') ?? '').trim();
    const tagRaw = String(form.get('tag') ?? '').trim();
    const visibility = String(form.get('visibility') ?? '').trim();
    const closeNow = form.get('closeNow') != null;

    if (!title) return fail(400, { error: 'Title is required.' });

    const patch: Record<string, unknown> = { title, tag: tagRaw.length > 0 ? tagRaw : null };
    if (['private', 'shared', 'code'].includes(visibility)) patch.visibility = visibility;
    if (closeNow) patch.closedAt = new Date().toISOString();

    try {
      await apiFetch(event, `/api/admin/sessions/${event.params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { updated: true };
  },

  delete: async (event) => {
    const form = await event.request.formData();
    const confirm = String(form.get('_confirm') ?? '').trim();
    const expected = String(form.get('expected') ?? '').trim();
    if (!confirm || confirm !== expected) {
      return fail(400, { error: 'Confirmation text does not match the session title.' });
    }
    try {
      await apiFetch(event, `/api/admin/sessions/${event.params.id}`, { method: 'DELETE' });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    throw redirect(303, '/admin/sessions');
  },

  addGrant: async (event) => {
    const form = await event.request.formData();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    if (!email) return fail(400, { error: 'Enter an email address.' });

    // Resolve email → userId via the admin users list. The list is small
    // (admin surface only), so a client-side filter is acceptable. Paginate
    // until the user is found or the page runs out.
    let found: User | null = null;
    let cursor: string | null = null;
    for (let page = 0; page < 20 && !found; page += 1) {
      const params = new URLSearchParams({ limit: '200' });
      if (cursor) params.set('cursor', cursor);
      try {
        const res = await apiJson<PaginatedUsers>(event, `/api/admin/users?${params.toString()}`);
        found = res.users.find((u) => u.email.toLowerCase() === email) ?? null;
        cursor = res.nextCursor;
      } catch (err) {
        if (isApiError(err)) return fail(err.status, { error: err.message });
        throw err;
      }
      if (!cursor) break;
    }
    if (!found) return fail(404, { error: `No user with email ${email}.` });

    try {
      await apiFetch(event, `/api/admin/sessions/${event.params.id}/grants`, {
        method: 'POST',
        body: JSON.stringify({ userId: found.id }),
      });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { grantAdded: email };
  },

  removeGrant: async (event) => {
    const form = await event.request.formData();
    const userId = String(form.get('userId') ?? '').trim();
    if (!userId) return fail(400, { error: 'Missing userId.' });
    try {
      await apiFetch(
        event,
        `/api/admin/sessions/${event.params.id}/grants/${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      );
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { grantRemoved: userId };
  },
};
