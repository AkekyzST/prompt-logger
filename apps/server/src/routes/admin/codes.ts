import { desc, eq, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { writeAuditLog } from '../../lib/audit.js';
import { db } from '../../lib/db/client.js';
import type { AuthVariables } from '../../middleware/session.js';
import { classCodes } from '../../schema/index.js';

/**
 * Admin-only class-code CRUD. Every write audited.
 */

export const adminCodeRoutes = new Hono<{ Variables: AuthVariables }>();

adminCodeRoutes.get('/codes', (c) => {
  const cursor = c.req.query('cursor')?.trim();
  const limit = Math.min(Math.max(Number.parseInt(c.req.query('limit') ?? '', 10) || 50, 1), 200);
  const list = db
    .select()
    .from(classCodes)
    .where(cursor ? lt(classCodes.code, cursor) : undefined)
    .orderBy(desc(classCodes.code))
    .limit(limit)
    .all();
  return c.json({ codes: list, nextCursor: list.length === limit ? list.at(-1)?.code : null });
});

const createSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'code must be URL-safe'),
  tag: z.string().min(1).max(128),
  label: z.string().max(200).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

adminCodeRoutes.post('/codes', async (c) => {
  const actor = c.get('user')!;
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const existing = db.select().from(classCodes).where(eq(classCodes.code, body.code)).get();
  if (existing) return c.json({ error: 'code_taken' }, 409);

  db.insert(classCodes)
    .values({
      code: body.code,
      tag: body.tag,
      label: body.label ?? null,
      expiresAt: body.expiresAt ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();

  const created = db.select().from(classCodes).where(eq(classCodes.code, body.code)).get();

  writeAuditLog({
    actorId: actor.id,
    action: 'code.create',
    targetType: 'code',
    targetId: body.code,
    metadata: { code: created },
  });

  return c.json({ code: created }, 201);
});

adminCodeRoutes.delete('/codes/:code', (c) => {
  const actor = c.get('user')!;
  const code = c.req.param('code');

  const before = db.select().from(classCodes).where(eq(classCodes.code, code)).get();
  if (!before) return c.json({ error: 'not_found' }, 404);

  db.delete(classCodes).where(eq(classCodes.code, code)).run();

  writeAuditLog({
    actorId: actor.id,
    action: 'code.delete',
    targetType: 'code',
    targetId: code,
    metadata: { before },
  });

  return c.body(null, 204);
});
