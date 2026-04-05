import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle schema for Prompt Logger. Mirrors docs/ARCHITECTURE.md §5.
 *
 * The FTS5 virtual table (prompts_fts) and its triggers are defined in the
 * migration file because Drizzle cannot model virtual tables.
 */

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // OIDC sub
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  role: text('role', { enum: ['admin', 'viewer'] }).notNull(),
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // ULID
  claudeSessionId: text('claude_session_id').unique(),
  title: text('title').notNull(),
  seq: integer('seq').notNull(),
  tag: text('tag'),
  visibility: text('visibility', { enum: ['private', 'shared', 'code'] })
    .notNull()
    .default('private'),
  cwd: text('cwd'),
  firstPromptPreview: text('first_prompt_preview'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  closedAt: text('closed_at'),
});

export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(), // redacted
    rawHash: text('raw_hash'), // sha256 of original
    redactions: text('redactions'), // JSON
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    bySessionSeq: index('idx_prompts_session_seq').on(t.sessionId, t.seq),
  })
);

export const sessionGrants = sqliteTable(
  'session_grants',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    grantedAt: text('granted_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.userId] }),
  })
);

export const classCodes = sqliteTable('class_codes', {
  code: text('code').primaryKey(),
  tag: text('tag').notNull(),
  label: text('label'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
});

export const codeRedemptions = sqliteTable(
  'code_redemptions',
  {
    code: text('code')
      .notNull()
      .references(() => classCodes.code, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redeemedAt: text('redeemed_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.code, t.userId] }),
  })
);

export const authSessions = sqliteTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(), // sha256(cookie value)
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
  userAgent: text('user_agent'),
  ip: text('ip'),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(), // ULID
    actorId: text('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: text('metadata'), // JSON string
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    byCreatedAt: index('idx_audit_log_created_at').on(t.createdAt),
    byActor: index('idx_audit_log_actor_id').on(t.actorId),
  })
);

// Re-export sql helper for callers that need raw expressions next to the
// schema (e.g. migration scripts).
export { sql };
