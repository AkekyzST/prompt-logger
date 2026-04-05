import { apiJson } from '$lib/api/client.js';
import type { PaginatedAudit, PaginatedUsers, User } from '$lib/api/types.js';
import type { ServerLoad } from '@sveltejs/kit';

/**
 * Audit log. Enrich each entry's actorId with the corresponding user email
 * via the admin users list (small N). `nextCursor` is an opaque ULID passed
 * through as `?cursor=` on the Load-more link.
 */
export const load: ServerLoad = async (event) => {
  const cursor = event.url.searchParams.get('cursor')?.trim() ?? '';
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);
  const page = await apiJson<PaginatedAudit>(event, `/api/admin/audit?${params.toString()}`);

  let users: User[] = [];
  try {
    const usersPage = await apiJson<PaginatedUsers>(event, '/api/admin/users?limit=200');
    users = usersPage.users;
  } catch {
    // Degrade to raw ids if the users list is unavailable.
  }
  const actorById = new Map(users.map((u) => [u.id, u.email]));

  const enriched = page.entries.map((e) => ({
    ...e,
    actorEmail: actorById.get(e.actorId) ?? null,
  }));

  return {
    entries: enriched,
    nextCursor: page.nextCursor ?? null,
  };
};
