import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db, rawDb } from '../lib/db/client.js';
import { runMigrations } from '../lib/db/migrate.js';
import {
  classCodes,
  codeRedemptions,
  prompts,
  sessionGrants,
  sessions,
  users,
} from '../schema/index.js';
import { canViewSession } from './access.js';

/**
 * Matrix test for the canonical access check.
 *
 * Fixtures:
 *   users: admin, granted (member of a shared session), redeemer (holds a
 *     matching class code redemption), outsider (no grants, no redemptions)
 *   sessions (all tagged 'cs101'):
 *     private      — visibility=private
 *     sharedOk     — visibility=shared, grant to `granted`
 *     sharedOther  — visibility=shared, grant to a different user
 *     codeOk       — visibility=code, tag cs101, class_code cs101-fall
 *     codeWrong    — visibility=code, tag cs999, unmatched
 *     codeExpired  — visibility=code, tag cs101-exp, class_code already past
 *
 * The test asserts every (user × session) cell. 4 × 6 = 24 combinations,
 * above the 16 minimum.
 */

const USERS = {
  admin: { id: 'u-admin', email: 'admin@example.test', role: 'admin' as const },
  granted: { id: 'u-granted', email: 'granted@example.test', role: 'viewer' as const },
  redeemer: { id: 'u-redeemer', email: 'redeemer@example.test', role: 'viewer' as const },
  outsider: { id: 'u-outsider', email: 'outsider@example.test', role: 'viewer' as const },
  otherGrantee: {
    id: 'u-other-grantee',
    email: 'other@example.test',
    role: 'viewer' as const,
  },
};

const SESSIONS = {
  privateS: { id: 's-private', visibility: 'private' as const, tag: 'cs101' },
  sharedOk: { id: 's-shared-ok', visibility: 'shared' as const, tag: 'cs101' },
  sharedOther: { id: 's-shared-other', visibility: 'shared' as const, tag: 'cs101' },
  codeOk: { id: 's-code-ok', visibility: 'code' as const, tag: 'cs101' },
  codeWrong: { id: 's-code-wrong', visibility: 'code' as const, tag: 'cs999' },
  codeExpired: { id: 's-code-expired', visibility: 'code' as const, tag: 'cs101-exp' },
};

const CODES = {
  active: { code: 'cs101-fall', tag: 'cs101', expiresAt: null as string | null },
  expired: {
    code: 'cs101-exp-code',
    tag: 'cs101-exp',
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
};

beforeAll(() => {
  runMigrations(rawDb);
});

beforeEach(() => {
  // Wipe in dependency order.
  db.delete(codeRedemptions).run();
  db.delete(classCodes).run();
  db.delete(sessionGrants).run();
  db.delete(prompts).run();
  db.delete(sessions).run();
  db.delete(users).run();

  const now = new Date().toISOString();

  // Users.
  for (const u of Object.values(USERS)) {
    db.insert(users)
      .values({
        id: u.id,
        email: u.email,
        displayName: null,
        role: u.role,
        createdAt: now,
        lastLoginAt: null,
      })
      .run();
  }

  // Sessions.
  let seq = 1;
  for (const s of Object.values(SESSIONS)) {
    db.insert(sessions)
      .values({
        id: s.id,
        claudeSessionId: null,
        title: s.id,
        seq: seq++,
        tag: s.tag,
        visibility: s.visibility,
        cwd: null,
        firstPromptPreview: null,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      })
      .run();
  }

  // Grants: shared-ok → granted user; shared-other → other grantee.
  db.insert(sessionGrants)
    .values({ sessionId: SESSIONS.sharedOk.id, userId: USERS.granted.id, grantedAt: now })
    .run();
  db.insert(sessionGrants)
    .values({
      sessionId: SESSIONS.sharedOther.id,
      userId: USERS.otherGrantee.id,
      grantedAt: now,
    })
    .run();

  // Class codes + redemptions.
  db.insert(classCodes)
    .values({
      code: CODES.active.code,
      tag: CODES.active.tag,
      label: 'Fall 2026',
      expiresAt: CODES.active.expiresAt,
      createdAt: now,
    })
    .run();
  db.insert(classCodes)
    .values({
      code: CODES.expired.code,
      tag: CODES.expired.tag,
      label: 'Expired section',
      expiresAt: CODES.expired.expiresAt,
      createdAt: now,
    })
    .run();

  // The redeemer holds BOTH codes — including the expired one — so we can
  // assert that expiry alone disqualifies them.
  db.insert(codeRedemptions)
    .values({ code: CODES.active.code, userId: USERS.redeemer.id, redeemedAt: now })
    .run();
  db.insert(codeRedemptions)
    .values({ code: CODES.expired.code, userId: USERS.redeemer.id, redeemedAt: now })
    .run();
});

interface Cell {
  user: keyof typeof USERS;
  session: keyof typeof SESSIONS;
  expected: boolean;
  why: string;
}

const MATRIX: Cell[] = [
  // Admin sees everything.
  { user: 'admin', session: 'privateS', expected: true, why: 'admin bypasses visibility' },
  { user: 'admin', session: 'sharedOk', expected: true, why: 'admin bypasses grants' },
  { user: 'admin', session: 'sharedOther', expected: true, why: 'admin bypasses grants' },
  { user: 'admin', session: 'codeOk', expected: true, why: 'admin bypasses codes' },
  { user: 'admin', session: 'codeWrong', expected: true, why: 'admin bypasses codes' },
  { user: 'admin', session: 'codeExpired', expected: true, why: 'admin bypasses expiry' },

  // Granted user: only the one shared session they hold a grant for.
  { user: 'granted', session: 'privateS', expected: false, why: 'private is admin-only' },
  { user: 'granted', session: 'sharedOk', expected: true, why: 'has grant' },
  { user: 'granted', session: 'sharedOther', expected: false, why: 'grant is for someone else' },
  { user: 'granted', session: 'codeOk', expected: false, why: 'no redemption' },
  { user: 'granted', session: 'codeWrong', expected: false, why: 'no redemption' },
  { user: 'granted', session: 'codeExpired', expected: false, why: 'no redemption' },

  // Redeemer: only code-visibility sessions whose tag matches a still-valid code.
  { user: 'redeemer', session: 'privateS', expected: false, why: 'private is admin-only' },
  { user: 'redeemer', session: 'sharedOk', expected: false, why: 'no grant' },
  { user: 'redeemer', session: 'sharedOther', expected: false, why: 'no grant' },
  { user: 'redeemer', session: 'codeOk', expected: true, why: 'active code tag matches' },
  { user: 'redeemer', session: 'codeWrong', expected: false, why: 'no code for tag cs999' },
  {
    user: 'redeemer',
    session: 'codeExpired',
    expected: false,
    why: 'holds redemption but code is expired',
  },

  // Outsider: no grants, no redemptions. Everything denied.
  { user: 'outsider', session: 'privateS', expected: false, why: 'no access at all' },
  { user: 'outsider', session: 'sharedOk', expected: false, why: 'no grant' },
  { user: 'outsider', session: 'sharedOther', expected: false, why: 'no grant' },
  { user: 'outsider', session: 'codeOk', expected: false, why: 'no redemption' },
  { user: 'outsider', session: 'codeWrong', expected: false, why: 'no redemption' },
  { user: 'outsider', session: 'codeExpired', expected: false, why: 'no redemption' },
];

describe('canViewSession — access control matrix', () => {
  it(`evaluates ${MATRIX.length} cells (>= 16 required by spec)`, () => {
    expect(MATRIX.length).toBeGreaterThanOrEqual(16);
  });

  for (const cell of MATRIX) {
    it(`${cell.user} × ${cell.session} → ${cell.expected} (${cell.why})`, () => {
      const u = USERS[cell.user];
      const s = SESSIONS[cell.session];
      const actual = canViewSession(u.id, u.role, s.id);
      expect(actual).toEqual(cell.expected);
    });
  }

  it('returns false for an unknown session id', () => {
    expect(canViewSession(USERS.admin.id, 'admin', 'does-not-exist')).toEqual(false);
    expect(canViewSession(USERS.outsider.id, 'viewer', 'does-not-exist')).toEqual(false);
  });
});
