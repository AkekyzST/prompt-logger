import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../lib/db/client.js';
import { requireAuth } from '../middleware/access.js';
import type { AuthVariables } from '../middleware/session.js';

/**
 * GET /api/me — return the current user and high-level counts describing
 * what they can see. For admins the counts are the totals; for viewers the
 * counts are derived from the union of session_grants and code_redemptions.
 */

export const meRoutes = new Hono<{ Variables: AuthVariables }>();

meRoutes.use('*', requireAuth);

meRoutes.get('/me', (c) => {
  // requireAuth guarantees this is defined.
  const user = c.get('user')!;
  const nowIso = new Date().toISOString();

  let accessibleSessionCount: number;
  let accessibleTagCount: number;

  if (user.role === 'admin') {
    const sessCount = db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM sessions`)?.n ?? 0;
    const tagCount =
      db.get<{ n: number }>(
        sql`SELECT COUNT(DISTINCT tag) AS n FROM sessions WHERE tag IS NOT NULL`
      )?.n ?? 0;
    accessibleSessionCount = sessCount;
    accessibleTagCount = tagCount;
  } else {
    // Count distinct sessions the viewer can see via either grants or code.
    accessibleSessionCount =
      db.get<{ n: number }>(sql`
        SELECT COUNT(DISTINCT s.id) AS n FROM sessions s WHERE (
          (s.visibility = 'shared' AND EXISTS (
            SELECT 1 FROM session_grants g
            WHERE g.session_id = s.id AND g.user_id = ${user.id}
          ))
          OR (s.visibility = 'code' AND EXISTS (
            SELECT 1 FROM code_redemptions r
            JOIN class_codes c ON c.code = r.code
            WHERE r.user_id = ${user.id}
              AND c.tag = s.tag
              AND (c.expires_at IS NULL OR c.expires_at > ${nowIso})
          ))
        )
      `)?.n ?? 0;

    accessibleTagCount =
      db.get<{ n: number }>(sql`
        SELECT COUNT(DISTINCT c.tag) AS n FROM class_codes c
        JOIN code_redemptions r ON r.code = c.code
        WHERE r.user_id = ${user.id}
          AND (c.expires_at IS NULL OR c.expires_at > ${nowIso})
      `)?.n ?? 0;
  }

  return c.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    accessibleSessionCount,
    accessibleTagCount,
  });
});
