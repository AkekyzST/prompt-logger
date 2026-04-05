/**
 * Server-side API client used by SvelteKit `load` functions and endpoints.
 *
 * Forwards the incoming browser's `Cookie` header (carrying `pl_sess`) so the
 * Hono API can identify the caller. In dev the UI runs on Vite's port while
 * the API is on another origin (defaults to http://localhost:3000) — the
 * origin can be overridden via `VITE_API_ORIGIN`. In production the UI is
 * mounted same-origin by the server, so relative paths are used as-is.
 */

import { dev } from '$app/environment';
import type { RequestEvent } from '@sveltejs/kit';
import { ApiError } from './errors.js';

/**
 * Test-only canned responder. Activates ONLY when the dev server is running
 * AND `VITE_TEST_AUTH_BYPASS=1` is in the env. Every server-side `apiFetch`
 * call short-circuits to a deterministic empty JSON payload so Playwright
 * specs can mount admin and viewer pages without a real backend.
 *
 * Production builds short-circuit on `dev === false` at the top of the
 * function, so this path can never ship.
 */
function testBypassResponse(path: string): Response | null {
  const bypass =
    dev && typeof import.meta.env !== 'undefined' && import.meta.env.VITE_TEST_AUTH_BYPASS === '1';
  if (!bypass) return null;

  const u = new URL(path, 'http://localhost');
  const p = u.pathname;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  if (p === '/api/me') {
    return json({
      id: 'test-admin',
      email: 'test-admin@example.com',
      displayName: 'Test Admin',
      role: 'admin',
      accessibleSessionCount: 0,
      accessibleTagCount: 0,
    });
  }

  if (p.startsWith('/api/admin/sessions')) {
    // Could be the list endpoint or a detail endpoint.
    if (/\/api\/admin\/sessions\/[^/]+$/.test(p)) {
      return json({
        session: {
          id: 'stub',
          title: 'Stub session',
          tag: null,
          visibility: 'private',
          closedAt: null,
          createdAt: new Date().toISOString(),
          seq: 0,
        },
        prompts: [],
        grants: [],
      });
    }
    return json({ sessions: [], nextCursor: null });
  }

  if (p.startsWith('/api/admin/users')) return json({ users: [] });
  if (p.startsWith('/api/admin/codes')) return json({ codes: [] });
  if (p.startsWith('/api/admin/audit')) return json({ entries: [], nextCursor: null });

  if (p.startsWith('/api/sessions/')) {
    // Generate a deterministic 50-prompt session so the viewer page SSRs a
    // complete list for the hero e2e spec.
    const prompts = Array.from({ length: 50 }, (_, i) => ({
      id: `p-${i + 1}`,
      sessionId: 'stub',
      seq: i + 1,
      role: 'user',
      content: `Prompt number ${i + 1}`,
      rawHash: null,
      redactions: null,
      createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, i)).toISOString(),
    }));
    return json({
      session: {
        id: 'stub',
        title: 'Stub session',
        tag: 'cs101',
        visibility: 'shared',
        closedAt: null,
        createdAt: new Date().toISOString(),
        seq: 50,
      },
      prompts,
    });
  }

  if (p.startsWith('/api/stream/')) {
    return new Response('retry: 10000\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  // Fallback — empty object, 200, so loaders don't blow up on unknown paths.
  return json({});
}

/**
 * Resolve the API origin. Relative in prod (same-origin), configurable in dev.
 */
function apiOrigin(): string {
  if (!dev) return '';
  // Vite replaces this at build time for the client bundle; on the server
  // it reads from process.env at runtime via Vite's define.
  const fromEnv =
    typeof import.meta.env !== 'undefined'
      ? (import.meta.env.VITE_API_ORIGIN as string | undefined)
      : undefined;
  return fromEnv ?? 'http://localhost:3000';
}

function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = apiOrigin();
  if (!origin) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function hasBody(init: RequestInit | undefined): boolean {
  return !!(init && init.body !== undefined && init.body !== null);
}

function isWriteMethod(method: string | undefined): boolean {
  if (!method) return false;
  const m = method.toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

/**
 * Low-level typed fetch. Forwards the session cookie and returns the raw
 * `Response`. Callers that want parsed JSON should use {@link apiJson}.
 */
export async function apiFetch(
  event: Pick<RequestEvent, 'request' | 'fetch'>,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const bypass = testBypassResponse(path);
  if (bypass) return bypass;

  const headers = new Headers(init.headers ?? {});
  const incomingCookie = event.request.headers.get('cookie');
  if (incomingCookie && !headers.has('cookie')) {
    headers.set('cookie', incomingCookie);
  }
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }
  if (isWriteMethod(init.method) && hasBody(init) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const url = resolveUrl(path);
  return event.fetch(url, { ...init, headers });
}

/**
 * JSON variant that parses the response and throws {@link ApiError} on
 * non-2xx. 204 responses resolve to `undefined as T`.
 */
export async function apiJson<T = unknown>(
  event: Pick<RequestEvent, 'request' | 'fetch'>,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await apiFetch(event, path, init);
  const requestId = res.headers.get('x-request-id') ?? undefined;

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : res.statusText) || `request failed (${res.status})`;
    throw new ApiError(message, res.status, requestId);
  }

  return body as T;
}
