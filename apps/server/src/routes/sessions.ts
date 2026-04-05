import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../lib/db/client.js';
import { canViewSession, requireAuth } from '../middleware/access.js';
import type { AuthVariables } from '../middleware/session.js';
import { prompts, sessions } from '../schema/index.js';

/**
 * GET /api/sessions/:id — return a session + its prompts if the caller
 * passes the canonical access check. Any failure returns 403; no distinction
 * is made between "not found" and "not allowed" to avoid leaking existence.
 */

export const sessionRoutes = new Hono<{ Variables: AuthVariables }>();

sessionRoutes.use('*', requireAuth);

sessionRoutes.get('/sessions/:id', (c) => {
  const user = c.get('user')!;
  const sessionId = c.req.param('id');

  if (!canViewSession(user.id, user.role, sessionId)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) {
    // Access check passed but row vanished — shouldn't happen, and we return
    // the same shape as the forbidden case to avoid leaking existence.
    return c.json({ error: 'forbidden' }, 403);
  }

  const sessionPrompts = db
    .select({
      id: prompts.id,
      seq: prompts.seq,
      role: prompts.role,
      content: prompts.content,
      redactions: prompts.redactions,
      createdAt: prompts.createdAt,
    })
    .from(prompts)
    .where(eq(prompts.sessionId, sessionId))
    .orderBy(asc(prompts.seq))
    .all();

  return c.json({ session, prompts: sessionPrompts });
});
