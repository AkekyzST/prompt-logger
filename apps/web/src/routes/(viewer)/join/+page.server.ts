import { apiJson } from '$lib/api/client.js';
import { isApiError } from '$lib/api/errors.js';
import type { JoinResponse } from '$lib/api/types.js';
import { type Actions, fail, redirect } from '@sveltejs/kit';

/**
 * POST action for /join — reads the `code` form field, calls POST /api/join,
 * and redirects to /c/:tag on success. Idempotent upstream, so a user who
 * re-submits an already-redeemed code still lands on the same destination.
 */
export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const code = String(form.get('code') ?? '').trim();
    if (!code) {
      return fail(400, { error: 'Enter a class code.', code });
    }

    try {
      const res = await apiJson<JoinResponse>(event, '/api/join', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      throw redirect(
        303,
        `/c/${encodeURIComponent(res.tag)}?joined=${encodeURIComponent(res.tag)}`
      );
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 404) return fail(400, { error: 'Unknown or expired code.', code });
        return fail(err.status, { error: err.message, code });
      }
      throw err;
    }
  },
};
