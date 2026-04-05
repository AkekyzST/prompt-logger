/**
 * TypeScript types mirroring the Prompt Logger server API responses.
 *
 * Derived from apps/server/src/routes/**.ts and apps/server/src/schema/index.ts.
 * Keep in sync by hand — do not import from the server package so the web
 * bundle stays isolated from server-only dependencies (drizzle, sqlite, …).
 */

export type UserRole = 'admin' | 'viewer';

export type SessionVisibility = 'private' | 'shared' | 'code';

export type PromptRole = 'user' | 'assistant';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface MeResponse {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  accessibleSessionCount: number;
  accessibleTagCount: number;
}

export interface Session {
  id: string;
  claudeSessionId: string | null;
  title: string;
  seq: number;
  tag: string | null;
  visibility: SessionVisibility;
  cwd: string | null;
  firstPromptPreview: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/** Structured redaction metadata stored per prompt. */
export interface Redaction {
  type: string;
  start: number;
  end: number;
  replacement?: string;
}

export interface Prompt {
  id: string;
  sessionId: string;
  seq: number;
  role: PromptRole;
  content: string;
  rawHash?: string | null;
  redactions: Redaction[] | null;
  createdAt: string;
}

export interface SessionWithPrompts {
  session: Session;
  prompts: Prompt[];
}

export interface ClassCode {
  code: string;
  tag: string;
  label: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ClassCodeWithStats extends ClassCode {
  redemptionCount: number;
}

export interface SessionGrant {
  sessionId: string;
  userId: string;
  grantedAt: string;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface JoinResponse {
  granted: boolean;
  tag: string;
  label: string | null;
}

export interface PaginatedSessions {
  sessions: Session[];
  nextCursor: string | null;
}

export interface PaginatedCodes {
  codes: ClassCode[];
  nextCursor: string | null;
}

export interface PaginatedUsers {
  users: User[];
  nextCursor: string | null;
}

export interface PaginatedAudit {
  entries: AuditEntry[];
  nextCursor: string | null;
}
