import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/audit.js';
import { db } from '../../lib/db/client.js';
import type { AuthVariables } from '../../middleware/session.js';
import { prompts, sessionGrants, sessions, users } from '../../schema/index.js';

/**
 * Admin-only session management. Every write calls writeAuditLog with the
 * before/after payload so the audit table is a complete record of admin
 * activity. All routes assume requireAuth + requireAdmin are attached at
 * the mount point.
 */

export const adminSessionRoutes = new Hono<{ Variables: AuthVariables }>();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

adminSessionRoutes.get('/sessions', (c) => {
  const q = c.req.query('q')?.trim();
  const tag = c.req.query('tag')?.trim();
  const cursor = c.req.query('cursor')?.trim();
  const limit = Math.min(
    Math.max(Number.parseInt(c.req.query('limit') ?? '', 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  if (q) {
    // FTS path: find sessions whose prompts match. Join prompts_fts, then
    // group by session id and sort by most recent updated_at.
    const rows = db.all<{
      id: string;
      title: string;
      tag: string | null;
      visibility: string;
      seq: number;
      cwd: string | null;
      first_prompt_preview: string | null;
      created_at: string;
      updated_at: string;
      closed_at: string | null;
    }>(sql`
      SELECT s.id, s.title, s.tag, s.visibility, s.seq, s.cwd,
             s.first_prompt_preview, s.created_at, s.updated_at, s.closed_at
      FROM sessions s
      JOIN prompts p ON p.session_id = s.id
      JOIN prompts_fts f ON f.rowid = p.rowid
      WHERE f.content MATCH ${q}
        ${tag ? sql`AND s.tag = ${tag}` : sql``}
        ${cursor ? sql`AND s.id < ${cursor}` : sql``}
      GROUP BY s.id
      ORDER BY s.id DESC
      LIMIT ${limit}
    `);
    return c.json({ sessions: rows, nextCursor: rows.length === limit ? rows.at(-1)?.id : null });
  }

  // Non-FTS path: use drizzle's query builder.
  const whereClauses = [];
  if (tag) whereClauses.push(eq(sessions.tag, tag));
  if (cursor) whereClauses.push(lt(sessions.id, cursor));
  const list = db
    .select()
    .from(sessions)
    .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
    .orderBy(desc(sessions.id))
    .limit(limit)
    .all();
  return c.json({ sessions: list, nextCursor: list.length === limit ? list.at(-1)?.id : null });
});

adminSessionRoutes.get('/sessions/:id', (c) => {
  const sessionId = c.req.param('id');
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return c.json({ error: 'not_found' }, 404);
  const sessionPrompts = db
    .select()
    .from(prompts)
    .where(eq(prompts.sessionId, sessionId))
    .orderBy(asc(prompts.seq))
    .all();
  return c.json({ session, prompts: sessionPrompts });
});

const patchSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    tag: z.string().max(128).nullable().optional(),
    visibility: z.enum(['private', 'shared', 'code']).optional(),
    closedAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'patch body must be non-empty' });

adminSessionRoutes.patch('/sessions/:id', async (c) => {
  const user = c.get('user')!;
  const sessionId = c.req.param('id');

  let patch: z.infer<typeof patchSchema>;
  try {
    const raw = await c.req.json();
    patch = patchSchema.parse(raw);
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const before = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!before) return c.json({ error: 'not_found' }, 404);

  const updateValues: Partial<typeof sessions.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.title !== undefined) updateValues.title = patch.title;
  if (patch.tag !== undefined) updateValues.tag = patch.tag;
  if (patch.visibility !== undefined) updateValues.visibility = patch.visibility;
  if (patch.closedAt !== undefined) updateValues.closedAt = patch.closedAt;

  db.update(sessions).set(updateValues).where(eq(sessions.id, sessionId)).run();

  const after = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();

  writeAuditLog({
    actorId: user.id,
    action: 'session.update',
    targetType: 'session',
    targetId: sessionId,
    metadata: { before, after, patch },
  });

  return c.json({ session: after });
});

adminSessionRoutes.delete('/sessions/:id', (c) => {
  const user = c.get('user')!;
  const sessionId = c.req.param('id');
  const before = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!before) return c.json({ error: 'not_found' }, 404);

  db.delete(sessions).where(eq(sessions.id, sessionId)).run();

  writeAuditLog({
    actorId: user.id,
    action: 'session.delete',
    targetType: 'session',
    targetId: sessionId,
    metadata: { before },
  });

  return c.body(null, 204);
});

const grantSchema = z.object({
  userId: z.string().min(1).max(256),
});

adminSessionRoutes.post('/sessions/:id/grants', async (c) => {
  const actor = c.get('user')!;
  const sessionId = c.req.param('id');

  let body: { userId: string };
  try {
    body = grantSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return c.json({ error: 'session_not_found' }, 404);
  const target = db.select().from(users).where(eq(users.id, body.userId)).get();
  if (!target) return c.json({ error: 'user_not_found' }, 404);

  db.insert(sessionGrants)
    .values({
      sessionId,
      userId: body.userId,
      grantedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();

  writeAuditLog({
    actorId: actor.id,
    action: 'grant.create',
    targetType: 'grant',
    targetId: `${sessionId}:${body.userId}`,
    metadata: { sessionId, userId: body.userId },
  });

  return c.json({ granted: true });
});

adminSessionRoutes.delete('/sessions/:id/grants/:userId', (c) => {
  const actor = c.get('user')!;
  const sessionId = c.req.param('id');
  const userId = c.req.param('userId');

  db.delete(sessionGrants)
    .where(and(eq(sessionGrants.sessionId, sessionId), eq(sessionGrants.userId, userId)))
    .run();

  writeAuditLog({
    actorId: actor.id,
    action: 'grant.delete',
    targetType: 'grant',
    targetId: `${sessionId}:${userId}`,
    metadata: { sessionId, userId },
  });

  return c.body(null, 204);
});
