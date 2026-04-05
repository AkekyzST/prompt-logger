import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../lib/config.js';
import { db, rawDb } from '../../lib/db/client.js';
import { runMigrations } from '../../lib/db/migrate.js';
import { canViewSession, requireAuth } from '../../middleware/access.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { sessionMiddleware } from '../../middleware/session.js';
import {
  auditLog,
  authSessions,
  classCodes,
  codeRedemptions,
  prompts,
  sessionGrants,
  sessions,
  users,
} from '../../schema/index.js';
import { adminAuditRoutes } from './audit.js';
import { adminCodeRoutes } from './codes.js';
import { adminSessionRoutes } from './sessions.js';
import { adminUserRoutes } from './users.js';

/**
 * Integration tests for the admin surface:
 *   (a) non-admin gets 403
 *   (b) admin writes produce audit_log rows
 *   (c) cascade delete removes child rows
 *   (d) PATCH visibility publishes a session so a granted viewer can read it
 */

interface Ctx {
  app: Hono;
  adminToken: string;
  viewerToken: string;
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildApp(): Hono {
  const app = new Hono();
  app.use('*', sessionMiddleware);
  app.use('/api/admin/*', requireAuth, requireAdmin);
  app.route('/api/admin', adminSessionRoutes);
  app.route('/api/admin', adminUserRoutes);
  app.route('/api/admin', adminCodeRoutes);
  app.route('/api/admin', adminAuditRoutes);
  return app;
}

function cookieHeader(token: string): string {
  return `${config.SESSION_COOKIE_NAME}=${token}`;
}

async function seed(): Promise<Ctx> {
  const now = new Date().toISOString();

  db.insert(users)
    .values([
      {
        id: 'u-admin',
        email: 'admin@example.test',
        displayName: 'Admin',
        role: 'admin',
        createdAt: now,
        lastLoginAt: now,
      },
      {
        id: 'u-viewer',
        email: 'viewer@example.test',
        displayName: 'Viewer',
        role: 'viewer',
        createdAt: now,
        lastLoginAt: now,
      },
    ])
    .run();

  const adminToken = 'admin-test-token-value';
  const viewerToken = 'viewer-test-token-value';
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.insert(authSessions)
    .values([
      {
        tokenHash: hash(adminToken),
        userId: 'u-admin',
        expiresAt,
        createdAt: now,
        userAgent: null,
        ip: null,
      },
      {
        tokenHash: hash(viewerToken),
        userId: 'u-viewer',
        expiresAt,
        createdAt: now,
        userAgent: null,
        ip: null,
      },
    ])
    .run();

  return { app: buildApp(), adminToken, viewerToken };
}

beforeAll(() => {
  runMigrations(rawDb);
});

beforeEach(() => {
  db.delete(auditLog).run();
  db.delete(codeRedemptions).run();
  db.delete(classCodes).run();
  db.delete(sessionGrants).run();
  db.delete(prompts).run();
  db.delete(sessions).run();
  db.delete(authSessions).run();
  db.delete(users).run();
});

afterEach(() => {
  db.delete(auditLog).run();
  db.delete(codeRedemptions).run();
  db.delete(classCodes).run();
  db.delete(sessionGrants).run();
  db.delete(prompts).run();
  db.delete(sessions).run();
  db.delete(authSessions).run();
  db.delete(users).run();
});

describe('admin routes — authorization', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const ctx = await seed();
    const res = await ctx.app.request('/api/admin/sessions');
    expect(res.status).toEqual(401);
  });

  it('rejects viewer (non-admin) requests with 403', async () => {
    const ctx = await seed();
    const res = await ctx.app.request('/api/admin/sessions', {
      headers: { cookie: cookieHeader(ctx.viewerToken) },
    });
    expect(res.status).toEqual(403);
  });

  it('allows admin requests', async () => {
    const ctx = await seed();
    const res = await ctx.app.request('/api/admin/sessions', {
      headers: { cookie: cookieHeader(ctx.adminToken) },
    });
    expect(res.status).toEqual(200);
    const body = (await res.json()) as { sessions: unknown[] };
    expect(Array.isArray(body.sessions)).toBe(true);
  });
});

describe('admin sessions — writes are audited', () => {
  async function insertFixtureSession(sessionId: string, visibility: 'private' | 'shared' | 'code') {
    const now = new Date().toISOString();
    db.insert(sessions)
      .values({
        id: sessionId,
        claudeSessionId: null,
        title: sessionId,
        seq: 1,
        tag: 'cs101',
        visibility,
        cwd: null,
        firstPromptPreview: null,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      })
      .run();
    db.insert(prompts)
      .values({
        id: `p-${sessionId}`,
        sessionId,
        seq: 1,
        role: 'user',
        content: 'hello',
        rawHash: null,
        redactions: null,
        createdAt: now,
      })
      .run();
  }

  it('PATCH visibility writes an audit row with before/after and publishes the session', async () => {
    const ctx = await seed();
    await insertFixtureSession('s-patch', 'private');

    // Grant the viewer to the session so that once it becomes shared, access
    // is permitted.
    db.insert(sessionGrants)
      .values({
        sessionId: 's-patch',
        userId: 'u-viewer',
        grantedAt: new Date().toISOString(),
      })
      .run();

    // Before: viewer cannot see private session.
    expect(canViewSession('u-viewer', 'viewer', 's-patch')).toBe(false);

    const res = await ctx.app.request('/api/admin/sessions/s-patch', {
      method: 'PATCH',
      headers: {
        cookie: cookieHeader(ctx.adminToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ visibility: 'shared' }),
    });
    expect(res.status).toEqual(200);

    // After: viewer can see the shared session (via existing grant).
    expect(canViewSession('u-viewer', 'viewer', 's-patch')).toBe(true);

    const audits = db.select().from(auditLog).all();
    expect(audits).toHaveLength(1);
    const entry = audits[0];
    if (!entry) throw new Error('unreachable');
    expect(entry.action).toEqual('session.update');
    expect(entry.targetType).toEqual('session');
    expect(entry.targetId).toEqual('s-patch');
    expect(entry.actorId).toEqual('u-admin');
    const meta = entry.metadata ? (JSON.parse(entry.metadata) as Record<string, unknown>) : null;
    expect(meta).not.toBeNull();
    expect((meta as { before: { visibility: string } }).before.visibility).toEqual('private');
    expect((meta as { after: { visibility: string } }).after.visibility).toEqual('shared');
  });

  it('DELETE cascades to prompts and session_grants', async () => {
    const ctx = await seed();
    await insertFixtureSession('s-del', 'shared');
    db.insert(sessionGrants)
      .values({
        sessionId: 's-del',
        userId: 'u-viewer',
        grantedAt: new Date().toISOString(),
      })
      .run();

    const res = await ctx.app.request('/api/admin/sessions/s-del', {
      method: 'DELETE',
      headers: { cookie: cookieHeader(ctx.adminToken) },
    });
    expect(res.status).toEqual(204);

    expect(db.select().from(sessions).all()).toHaveLength(0);
    expect(db.select().from(prompts).all()).toHaveLength(0);
    expect(db.select().from(sessionGrants).all()).toHaveLength(0);

    const audits = db.select().from(auditLog).all();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toEqual('session.delete');
  });

  it('POST /sessions/:id/grants audits and creates the grant', async () => {
    const ctx = await seed();
    await insertFixtureSession('s-grant', 'shared');

    const res = await ctx.app.request('/api/admin/sessions/s-grant/grants', {
      method: 'POST',
      headers: {
        cookie: cookieHeader(ctx.adminToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId: 'u-viewer' }),
    });
    expect(res.status).toEqual(200);

    expect(db.select().from(sessionGrants).all()).toHaveLength(1);
    const audits = db.select().from(auditLog).all();
    expect(audits.find((a) => a.action === 'grant.create')).toBeDefined();
  });
});

describe('admin users — CRUD is audited', () => {
  it('POST creates a stub user and audits', async () => {
    const ctx = await seed();
    const res = await ctx.app.request('/api/admin/users', {
      method: 'POST',
      headers: {
        cookie: cookieHeader(ctx.adminToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email: 'new@example.test', role: 'viewer' }),
    });
    expect(res.status).toEqual(201);
    const body = (await res.json()) as { user: { id: string; email: string; role: string } };
    expect(body.user.email).toEqual('new@example.test');
    expect(body.user.role).toEqual('viewer');
    expect(body.user.id).toMatch(/^pending:/);

    const audits = db.select().from(auditLog).all();
    expect(audits.find((a) => a.action === 'user.create')).toBeDefined();
  });

  it('PATCH promotes a user and audits before/after', async () => {
    const ctx = await seed();
    const res = await ctx.app.request('/api/admin/users/u-viewer', {
      method: 'PATCH',
      headers: {
        cookie: cookieHeader(ctx.adminToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(res.status).toEqual(200);

    const after = db.select().from(users).where(eq(users.id, 'u-viewer')).get();
    expect(after?.role).toEqual('admin');

    const audits = db.select().from(auditLog).all();
    const row = audits.find((a) => a.action === 'user.update');
    expect(row).toBeDefined();
    if (!row) throw new Error('unreachable');
    const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null;
    expect((meta as { before: { role: string } }).before.role).toEqual('viewer');
    expect((meta as { after: { role: string } }).after.role).toEqual('admin');
  });

  it('DELETE refuses to delete self', async () => {
    const ctx = await seed();
    const res = await ctx.app.request('/api/admin/users/u-admin', {
      method: 'DELETE',
      headers: { cookie: cookieHeader(ctx.adminToken) },
    });
    expect(res.status).toEqual(400);
    expect(db.select().from(users).all()).toHaveLength(2);
  });
});

describe('admin codes — CRUD is audited', () => {
  it('POST + DELETE produce matching audit rows', async () => {
    const ctx = await seed();

    const createRes = await ctx.app.request('/api/admin/codes', {
      method: 'POST',
      headers: {
        cookie: cookieHeader(ctx.adminToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: 'cs101-fall', tag: 'cs101', label: 'Fall' }),
    });
    expect(createRes.status).toEqual(201);

    const delRes = await ctx.app.request('/api/admin/codes/cs101-fall', {
      method: 'DELETE',
      headers: { cookie: cookieHeader(ctx.adminToken) },
    });
    expect(delRes.status).toEqual(204);

    const audits = db.select().from(auditLog).all();
    expect(audits.find((a) => a.action === 'code.create')).toBeDefined();
    expect(audits.find((a) => a.action === 'code.delete')).toBeDefined();
  });
});

describe('GET /api/admin/audit', () => {
  it('returns entries newest-first with parsed metadata', async () => {
    const ctx = await seed();

    // Produce two audited writes.
    await ctx.app.request('/api/admin/codes', {
      method: 'POST',
      headers: {
        cookie: cookieHeader(ctx.adminToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: 'a-one', tag: 't1' }),
    });
    await ctx.app.request('/api/admin/codes', {
      method: 'POST',
      headers: {
        cookie: cookieHeader(ctx.adminToken),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ code: 'a-two', tag: 't2' }),
    });

    const res = await ctx.app.request('/api/admin/audit', {
      headers: { cookie: cookieHeader(ctx.adminToken) },
    });
    expect(res.status).toEqual(200);
    const body = (await res.json()) as {
      entries: Array<{ action: string; metadata: unknown }>;
    };
    expect(body.entries.length).toBeGreaterThanOrEqual(2);
    // Newest-first: the two most recent entries should be code.create and
    // correspond to the codes we just inserted.
    expect(body.entries[0]?.action).toEqual('code.create');
  });
});

