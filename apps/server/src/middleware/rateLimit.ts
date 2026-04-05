import type { MiddlewareHandler } from 'hono';
import { config } from '../lib/config.js';

/**
 * In-memory token bucket keyed by client IP.
 *
 * Single-process only by design (see CLAUDE.md). Each bucket holds up to
 * `INGEST_RATE_LIMIT_PER_MIN` tokens and refills linearly over 60 s. When a
 * request arrives we refill first, then try to consume 1 token.
 *
 * To keep memory bounded under churn we evict the oldest buckets when the
 * map exceeds MAX_BUCKETS. This is a soft LRU — we don't pay for per-request
 * bookkeeping, we just iterate and drop stale entries when the cap is hit.
 */

interface Bucket {
  tokens: number;
  lastRefill: number; // epoch ms
}

const MAX_BUCKETS = 10_000;
const WINDOW_MS = 60_000;

interface Options {
  /** Monotonic clock source (override for tests). */
  now?: () => number;
  /** Override the per-minute cap (otherwise taken from config). */
  perMinute?: number;
}

export function createRateLimiter(opts: Options = {}) {
  const capacity = opts.perMinute ?? config.INGEST_RATE_LIMIT_PER_MIN;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  function refill(b: Bucket, t: number): void {
    const elapsed = t - b.lastRefill;
    if (elapsed <= 0) return;
    const add = (elapsed / WINDOW_MS) * capacity;
    b.tokens = Math.min(capacity, b.tokens + add);
    b.lastRefill = t;
  }

  function tryConsume(key: string): { allowed: boolean; retryAfter: number } {
    const t = now();
    let b = buckets.get(key);
    if (!b) {
      if (buckets.size >= MAX_BUCKETS) {
        // Evict oldest N entries. Map preserves insertion order.
        const toDrop = Math.max(1, Math.floor(MAX_BUCKETS / 10));
        let i = 0;
        for (const k of buckets.keys()) {
          buckets.delete(k);
          if (++i >= toDrop) break;
        }
      }
      b = { tokens: capacity, lastRefill: t };
      buckets.set(key, b);
    } else {
      refill(b, t);
      // Refresh insertion order so active keys are not evicted first.
      buckets.delete(key);
      buckets.set(key, b);
    }

    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, retryAfter: 0 };
    }
    const deficit = 1 - b.tokens;
    const retryAfter = Math.ceil((deficit * WINDOW_MS) / capacity / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  const middleware: MiddlewareHandler = async (c, next) => {
    const key = extractKey(c.req.header('x-forwarded-for'), c.env);
    const { allowed, retryAfter } = tryConsume(key);
    if (!allowed) {
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'rate_limited', retryAfter }, 429);
    }
    await next();
  };

  return { middleware, tryConsume, _buckets: buckets } as const;
}

function extractKey(xff: string | undefined, env: unknown): string {
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  // Hono-node-server exposes the underlying socket via c.env.incoming.
  const incoming = (env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

/**
 * Default limiter used by the server. Lazily created so config is available.
 */
let defaultLimiter: ReturnType<typeof createRateLimiter> | null = null;
export function rateLimit(): MiddlewareHandler {
  if (!defaultLimiter) defaultLimiter = createRateLimiter();
  return defaultLimiter.middleware;
}
