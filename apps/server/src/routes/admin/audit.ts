import { desc, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../lib/db/client.js';
import type { AuthVariables } from '../../middleware/session.js';
import { auditLog } from '../../schema/index.js';

/**
 * GET /api/admin/audit — paginated view of the audit log, newest first.
 * Cursor is an opaque (id) value; pass the previous page's `nextCursor`.
 */

export const adminAuditRoutes = new Hono<{ Variables: AuthVariables }>();

adminAuditRoutes.get('/audit', (c) => {
  const cursor = c.req.query('cursor')?.trim();
  const limit = Math.min(Math.max(Number.parseInt(c.req.query('limit') ?? '', 10) || 50, 1), 200);

  const rows = db
    .select()
    .from(auditLog)
    .where(cursor ? lt(auditLog.id, cursor) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit)
    .all();

  return c.json({
    entries: rows.map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    })),
    nextCursor: rows.length === limit ? rows.at(-1)?.id : null,
  });
});
