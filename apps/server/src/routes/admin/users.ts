import { Hono } from 'hono';
import { desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/audit.js';
import { db } from '../../lib/db/client.js';
import { users } from '../../schema/index.js';
import type { AuthVariables } from '../../middleware/session.js';

/**
 * Admin-only user management. POST creates a stub user row (by email) so
 * admins can pre-provision access before the user has logged in; on first
 * OIDC login the row is updated with the sub and last_login_at. For pre-
 * provisioned rows the id is set to a provisional value prefixed with
 * `pending:` so it cannot collide with a real OIDC sub.
 */

export const adminUserRoutes = new Hono<{ Variables: AuthVariables }>();

adminUserRoutes.get('/users', (c) => {
  const cursor = c.req.query('cursor')?.trim();
  const limit = Math.min(
    Math.max(Number.parseInt(c.req.query('limit') ?? '', 10) || 50, 1),
    200
  );
  const list = db
    .select()
    .from(users)
    .where(cursor ? lt(users.id, cursor) : undefined)
    .orderBy(desc(users.id))
    .limit(limit)
    .all();
  return c.json({ users: list, nextCursor: list.length === limit ? list.at(-1)?.id : null });
});

const createSchema = z.object({
  email: z.string().email().max(320),
  displayName: z.string().max(200).nullable().optional(),
  role: z.enum(['admin', 'viewer']).default('viewer'),
});

adminUserRoutes.post('/users', async (c) => {
  const actor = c.get('user')!;
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const existing = db.select().from(users).where(eq(users.email, body.email)).get();
  if (existing) return c.json({ error: 'email_taken' }, 409);

  const id = `pending:${body.email}`;
  const now = new Date().toISOString();
  db.insert(users)
    .values({
      id,
      email: body.email,
      displayName: body.displayName ?? null,
      role: body.role,
      createdAt: now,
      lastLoginAt: null,
    })
    .run();

  const created = db.select().from(users).where(eq(users.id, id)).get();

  writeAuditLog({
    actorId: actor.id,
    action: 'user.create',
    targetType: 'user',
    targetId: id,
    metadata: { user: created },
  });

  return c.json({ user: created }, 201);
});

const patchSchema = z
  .object({
    role: z.enum(['admin', 'viewer']).optional(),
    displayName: z.string().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'patch body must be non-empty' });

adminUserRoutes.patch('/users/:id', async (c) => {
  const actor = c.get('user')!;
  const targetId = c.req.param('id');

  let patch: z.infer<typeof patchSchema>;
  try {
    patch = patchSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const before = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!before) return c.json({ error: 'not_found' }, 404);

  const updateValues: Partial<typeof users.$inferInsert> = {};
  if (patch.role !== undefined) updateValues.role = patch.role;
  if (patch.displayName !== undefined) updateValues.displayName = patch.displayName;

  db.update(users).set(updateValues).where(eq(users.id, targetId)).run();
  const after = db.select().from(users).where(eq(users.id, targetId)).get();

  writeAuditLog({
    actorId: actor.id,
    action: 'user.update',
    targetType: 'user',
    targetId,
    metadata: { before, after, patch },
  });

  return c.json({ user: after });
});

adminUserRoutes.delete('/users/:id', (c) => {
  const actor = c.get('user')!;
  const targetId = c.req.param('id');

  if (targetId === actor.id) {
    return c.json({ error: 'cannot_delete_self' }, 400);
  }

  const before = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!before) return c.json({ error: 'not_found' }, 404);

  db.delete(users).where(eq(users.id, targetId)).run();

  writeAuditLog({
    actorId: actor.id,
    action: 'user.delete',
    targetType: 'user',
    targetId,
    metadata: { before },
  });

  return c.body(null, 204);
});
