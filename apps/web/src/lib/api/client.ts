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
