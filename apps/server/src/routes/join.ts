import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../lib/db/client.js';
import { classCodes, codeRedemptions } from '../schema/index.js';
import { requireAuth } from '../middleware/access.js';
import type { AuthVariables } from '../middleware/session.js';

/**
 * POST /api/join — redeem a class code. Idempotent: re-redeeming an
 * already-redeemed code succeeds and reports the same tag/label. Unknown,
 * malformed, or expired codes return 404 with a neutral error body.
 */

export const joinRoutes = new Hono<{ Variables: AuthVariables }>();

joinRoutes.use('*', requireAuth);

const bodySchema = z.object({
  code: z.string().trim().min(1).max(128),
});

joinRoutes.post('/join', async (c) => {
  const user = c.get('user')!;

  let body: { code: string };
  try {
    const raw = await c.req.json();
    body = bodySchema.parse(raw);
  } catch {
    return c.json({ error: 'invalid_body' }, 400);
  }

  const row = db.select().from(classCodes).where(eq(classCodes.code, body.code)).get();
  if (!row) {
    return c.json({ error: 'unknown_code' }, 404);
  }
  if (row.expiresAt !== null && row.expiresAt <= new Date().toISOString()) {
    return c.json({ error: 'expired_code' }, 404);
  }

  // ON CONFLICT DO NOTHING — idempotent redemption.
  db.insert(codeRedemptions)
    .values({
      code: row.code,
      userId: user.id,
      redeemedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();

  return c.json({ granted: true, tag: row.tag, label: row.label });
});
