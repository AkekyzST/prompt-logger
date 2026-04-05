import { apiFetch, apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type { PaginatedUsers } from '$lib/api/types.js';
import { type Actions, type ServerLoad, fail } from '@sveltejs/kit';

/**
 * Admin users list + CRUD actions. `remove` double-checks self-delete (the
 * server enforces this too; client-side disabling is only UX polish).
 */
export const load: ServerLoad = async (event) => {
  const cursor = event.url.searchParams.get('cursor')?.trim() ?? '';
  const params = new URLSearchParams({ limit: '100' });
  if (cursor) params.set('cursor', cursor);
  const page = await apiJson<PaginatedUsers>(event, `/api/admin/users?${params.toString()}`);
  return {
    users: page.users,
    nextCursor: page.nextCursor ?? null,
    currentUserId: event.locals.user?.id ?? null,
  };
};

export const actions: Actions = {
  invite: async (event) => {
    const form = await event.request.formData();
    const email = String(form.get('email') ?? '').trim();
    const displayName = String(form.get('displayName') ?? '').trim();
    const role = String(form.get('role') ?? 'viewer').trim();
    if (!email) return fail(400, { error: 'Email is required.' });
    try {
      await apiFetch(event, '/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          displayName: displayName || null,
          role: role === 'admin' ? 'admin' : 'viewer',
        }),
      });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { invited: email };
  },
  promote: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'Missing id.' });
    try {
      await apiFetch(event, `/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { updated: id };
  },
  demote: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'Missing id.' });
    if (id === event.locals.user?.id) {
      return fail(400, { error: 'Cannot modify your own account.' });
    }
    try {
      await apiFetch(event, `/api/admin/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'viewer' }),
      });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { updated: id };
  },
  remove: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    if (!id) return fail(400, { error: 'Missing id.' });
    if (id === event.locals.user?.id) {
      return fail(400, { error: 'Cannot delete your own account.' });
    }
    try {
      await apiFetch(event, `/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { removed: id };
  },
};
