import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { config } from '../lib/config.js';

/**
 * Validates `Authorization: Bearer <token>` against config.INGEST_TOKEN.
 *
 * Comparison uses `crypto.timingSafeEqual`. Because that function throws on
 * length mismatches, we normalise both sides to the same length by padding
 * the shorter with zeros and still performing the compare (then rejecting if
 * the original lengths differed). This gives a constant-time code path
 * regardless of whether the attacker-supplied token is the right length.
 */
export function bearerAuth(): MiddlewareHandler {
  const expected = Buffer.from(config.INGEST_TOKEN, 'utf8');

  return async (c, next) => {
    const header = c.req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const token = header.slice('Bearer '.length).trim();
    if (token.length === 0) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const provided = Buffer.from(token, 'utf8');
    if (!safeEqual(provided, expected)) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    await next();
  };
}

/**
 * Constant-time comparison that tolerates length mismatches. Exported for
 * unit tests.
 */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  const len = Math.max(a.length, b.length);
  const aPadded = Buffer.alloc(len);
  const bPadded = Buffer.alloc(len);
  a.copy(aPadded);
  b.copy(bPadded);
  const equal = timingSafeEqual(aPadded, bPadded);
  return equal && a.length === b.length;
}
