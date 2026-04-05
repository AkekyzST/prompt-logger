import type { MiddlewareHandler } from 'hono';
import { config } from '../lib/config.js';

/**
 * Reject requests whose body is larger than INGEST_MAX_BODY_KB.
 *
 * We inspect the `Content-Length` header up front (cheap) and fall back to
 * buffering the request body ourselves if the header is absent or a liar.
 * This middleware must run before any handler that reads the body so that
 * downstream `c.req.json()` still sees an intact stream.
 */
export function bodyLimit(): MiddlewareHandler {
  const maxBytes = config.INGEST_MAX_BODY_KB * 1024;

  return async (c, next) => {
    const declared = c.req.header('content-length');
    if (declared !== undefined) {
      const n = Number.parseInt(declared, 10);
      if (Number.isFinite(n) && n > maxBytes) {
        return c.json({ error: 'payload_too_large', maxBytes }, 413);
      }
    }

    // If Content-Length was missing or untrustworthy, buffer the body and
    // measure its actual size. We then replace the request with a fresh one
    // carrying the buffered body so downstream handlers can still read it.
    if (declared === undefined) {
      const raw = c.req.raw;
      const body = await raw.arrayBuffer();
      if (body.byteLength > maxBytes) {
        return c.json({ error: 'payload_too_large', maxBytes }, 413);
      }
      // Reattach the buffered body.
      const replayed = new Request(raw.url, {
        method: raw.method,
        headers: raw.headers,
        body: body.byteLength === 0 ? null : body,
      });
      // biome-ignore lint/suspicious/noExplicitAny: Hono's request swap is intentional.
      (c.req as any).raw = replayed;
    }

    await next();
  };
}
