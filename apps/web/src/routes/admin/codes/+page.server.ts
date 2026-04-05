import { apiFetch, apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type { PaginatedCodes } from '$lib/api/types.js';
import { type Actions, type ServerLoad, fail } from '@sveltejs/kit';

/**
 * Class-code CRUD. `PUBLIC_BASE_URL` is not available to the client bundle
 * for security, so we expose the safe, same-origin URL here via `url.origin`.
 * The server's env var is used only for deep links baked into emails; the
 * in-app copy button is always same-origin by construction.
 */
export const load: ServerLoad = async (event) => {
  const page = await apiJson<PaginatedCodes>(event, '/api/admin/codes?limit=100');
  return {
    codes: page.codes,
    nextCursor: page.nextCursor ?? null,
    baseUrl: event.url.origin,
  };
};

export const actions: Actions = {
  create: async (event) => {
    const form = await event.request.formData();
    const code = String(form.get('code') ?? '').trim();
    const tag = String(form.get('tag') ?? '').trim();
    const label = String(form.get('label') ?? '').trim();
    const expiresAt = String(form.get('expiresAt') ?? '').trim();
    if (!code || !tag) return fail(400, { error: 'Code and tag are required.' });
    try {
      await apiFetch(event, '/api/admin/codes', {
        method: 'POST',
        body: JSON.stringify({
          code,
          tag,
          label: label || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { created: code };
  },
  delete: async (event) => {
    const form = await event.request.formData();
    const code = String(form.get('code') ?? '');
    if (!code) return fail(400, { error: 'Missing code.' });
    try {
      await apiFetch(event, `/api/admin/codes/${encodeURIComponent(code)}`, { method: 'DELETE' });
    } catch (err) {
      if (isApiError(err)) return fail(err.status, { error: err.message });
      throw err;
    }
    return { deleted: code };
  },
};
