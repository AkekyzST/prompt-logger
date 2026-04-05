import { createHash } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { ulid } from 'ulid';
import { z } from 'zod';
import { config } from '../lib/config.js';
import { db } from '../lib/db/client.js';
import { broadcast, getOrCreateEmitter } from '../lib/emitter.js';
import { redact } from '../lib/redact.js';
import { bearerAuth } from '../middleware/bearerAuth.js';
import { bodyLimit } from '../middleware/bodyLimit.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { prompts, sessions } from '../schema/index.js';

/**
 * POST /api/ingest — hook → server entry point.
 *
 * Middleware: bodyLimit → bearerAuth → rateLimit → zodValidator
 *
 * Handler runs a single better-sqlite3 transaction that upserts the session,
 * inserts the prompt, and emits the 'prompt' event to subscribers.
 */

const ingestSchema = z
  .object({
    claude_session_id: z.string().min(1),
    cwd: z.string().optional(),
    hook_event: z.string().optional(),
    prompt: z.string(),
    mode: z.enum(['prompt-only', 'prompt-and-response']).optional(),
    client_host: z.string().optional(),
    client_ts: z.string().optional(),
  })
  .passthrough();

export type IngestInput = z.infer<typeof ingestSchema>;

function formatTitle(seq: number, at: Date): string {
  const iso = at.toISOString(); // 2026-04-05T14:32:10.000Z
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${date} ${time} \u00b7 Session ${seq}`;
}

export const ingestRoutes = new Hono();

ingestRoutes.post(
  '/ingest',
  bodyLimit(),
  bearerAuth(),
  rateLimit(),
  zValidator('json', ingestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'invalid_body', issues: result.error.issues }, 400);
    }
    return undefined;
  }),
  (c) => {
    const input = c.req.valid('json');
    const nowIso = new Date().toISOString();

    const redaction = redact(input.prompt, {
      redactEmails: config.REDACTION_REDACT_EMAILS,
      extraPatterns: config.REDACTION_EXTRA_PATTERNS,
    });
    const rawHash = createHash('sha256').update(input.prompt, 'utf8').digest('hex');

    const { promptId, promptSeq, sessionId } = db.transaction((tx) => {
      const existing = tx
        .select()
        .from(sessions)
        .where(eq(sessions.claudeSessionId, input.claude_session_id))
        .get();

      let sid: string;
      if (existing) {
        sid = existing.id;
        tx.update(sessions).set({ updatedAt: nowIso }).where(eq(sessions.id, sid)).run();
      } else {
        const nextSessionSeqRow = tx
          .select({ v: sql<number>`COALESCE(MAX(${sessions.seq}), 0) + 1` })
          .from(sessions)
          .get();
        const nextSessionSeq = nextSessionSeqRow?.v ?? 1;
        sid = ulid();
        tx.insert(sessions)
          .values({
            id: sid,
            claudeSessionId: input.claude_session_id,
            title: formatTitle(nextSessionSeq, new Date(nowIso)),
            seq: nextSessionSeq,
            visibility: 'private',
            cwd: input.cwd ?? null,
            firstPromptPreview: redaction.content.slice(0, 120),
            createdAt: nowIso,
            updatedAt: nowIso,
          })
          .run();
      }

      const nextPromptSeqRow = tx
        .select({ v: sql<number>`COALESCE(MAX(${prompts.seq}), 0) + 1` })
        .from(prompts)
        .where(eq(prompts.sessionId, sid))
        .get();
      const nextPromptSeq = nextPromptSeqRow?.v ?? 1;

      const pid = ulid();
      tx.insert(prompts)
        .values({
          id: pid,
          sessionId: sid,
          seq: nextPromptSeq,
          role: 'user',
          content: redaction.content,
          rawHash,
          redactions: JSON.stringify(redaction.redactions),
          createdAt: nowIso,
        })
        .run();

      return { promptId: pid, promptSeq: nextPromptSeq, sessionId: sid };
    });

    // Ensure an emitter exists even when no subscribers are attached yet;
    // this keeps behaviour consistent so tests can listen before/after.
    getOrCreateEmitter(sessionId);
    broadcast(sessionId, 'prompt', {
      id: promptId,
      seq: promptSeq,
      content: redaction.content,
      created_at: nowIso,
      redactions: redaction.redactions,
    });

    return c.json({ id: promptId, seq: promptSeq }, 201);
  }
);
