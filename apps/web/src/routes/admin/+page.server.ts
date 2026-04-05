import { apiJson } from '$lib/api/client.js';
import type { PaginatedSessions, Session } from '$lib/api/types.js';
import type { ServerLoad } from '@sveltejs/kit';

/**
 * Admin dashboard data.
 *
 * Fetches the most recent 20 admin sessions, splits them into "live now"
 * (closedAt === null) and "recent" (everything else, newest first), and
 * computes a simple "this week" rollup from rows whose `createdAt` falls
 * within the last 7 days. All numbers come from the single list call —
 * adding a dedicated stats endpoint is deferred to plan 004.
 */

interface DashboardStats {
  sessionCount: number;
  promptCount: number;
  redactionCount: number;
}

function computeStats(list: Session[]): DashboardStats {
  // `redactionCount` is not carried on the Session row (it lives on prompts),
  // so we report 0 and let future work surface it via a rollup endpoint.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let sessionCount = 0;
  let promptCount = 0;
  for (const s of list) {
    const t = Date.parse(s.createdAt);
    if (!Number.isNaN(t) && t >= cutoff) {
      sessionCount += 1;
      promptCount += s.seq;
    }
  }
  return { sessionCount, promptCount, redactionCount: 0 };
}

export const load: ServerLoad = async (event) => {
  const page = await apiJson<PaginatedSessions>(event, '/api/admin/sessions?limit=20');

  const live: Session[] = [];
  const recent: Session[] = [];
  for (const s of page.sessions) {
    if (s.closedAt === null) live.push(s);
    else recent.push(s);
  }
  // Keep recent newest-first — the list already arrives in id-desc order,
  // which matches creation order closely enough for ULID ids.

  return {
    live,
    recent,
    stats: computeStats(page.sessions),
  };
};
