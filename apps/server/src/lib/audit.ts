import { ulid } from 'ulid';
import { auditLog } from '../schema/index.js';
import { db } from './db/client.js';

/**
 * Append-only audit log. Every admin write (session, user, class-code, and
 * grant mutations) must call this. Sync on purpose: better-sqlite3 is sync
 * and we want the audit row committed in the same transaction as the write
 * it describes when callers choose to wrap both in db.transaction(...).
 */

export type AuditTargetType = 'session' | 'user' | 'code' | 'grant';

export interface AuditArgs {
  actorId: string;
  action: string;
  targetType: AuditTargetType;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function writeAuditLog(args: AuditArgs): string {
  const id = ulid();
  db.insert(auditLog)
    .values({
      id,
      actorId: args.actorId,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId ?? null,
      metadata: args.metadata ? JSON.stringify(args.metadata) : null,
      createdAt: new Date().toISOString(),
    })
    .run();
  return id;
}
