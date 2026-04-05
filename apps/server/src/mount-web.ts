import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Hono } from 'hono';
import { logger } from './lib/logger.js';

/**
 * Node-style request handler exposed by SvelteKit's `adapter-node` build.
 * The adapter emits a `handler.js` whose default export is a Connect-style
 * middleware `(req, res, next?) => void`.
 */
type NodeHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next?: (err?: unknown) => void
) => void;

type HandlerModule = { handler?: NodeHandler; default?: NodeHandler };

const PLACEHOLDER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Prompt Logger — Web UI not built</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 42rem; margin: 4rem auto; padding: 0 1.25rem; line-height: 1.5; }
      code { background: color-mix(in srgb, currentColor 10%, transparent); padding: 0.1em 0.35em; border-radius: 4px; }
      h1 { text-wrap: balance; }
    </style>
  </head>
  <body>
    <h1>Web UI not built</h1>
    <p>Run <code>pnpm --filter @prompt-logger/web build</code> to enable the UI.</p>
    <p>The API is running at <code>/api/*</code>.</p>
  </body>
</html>
`;

/**
 * Candidate locations for the SvelteKit adapter-node build output. We probe
 * these in order at the first non-/api request and cache whichever one loads.
 *
 *   - dev (tsx / vitest): `apps/server/src/mount-web.ts` → `../../web/build/handler.js`
 *   - compiled (tsc):     `apps/server/dist/mount-web.js` → `../../web/build/handler.js`
 *   - docker runtime:     `/app/dist/mount-web.js` → `../web/handler.js`
 *     (the Dockerfile copies `apps/web/build` to `/app/web`)
 *
 * An override is also honored via the `PROMPT_LOGGER_WEB_HANDLER` env var —
 * primarily to make tests deterministic without tempdir gymnastics.
 */
function candidateHandlerPaths(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const override = process.env.PROMPT_LOGGER_WEB_HANDLER;
  // When an override is provided we use it EXCLUSIVELY. This keeps tests
  // deterministic: pointing `PROMPT_LOGGER_WEB_HANDLER` at a non-existent path
  // must reliably exercise the "missing" branch even when a real
  // `apps/web/build/handler.js` is present on disk.
  if (override && override.length > 0) return [resolve(override)];
  return [resolve(here, '../../web/build/handler.js'), resolve(here, '../web/handler.js')];
}

type ResolvedState = { kind: 'ok'; handler: NodeHandler; path: string } | { kind: 'missing' };
type MountState = { kind: 'unresolved' } | ResolvedState;

let state: MountState = { kind: 'unresolved' };

/** Exposed for tests — resets the memoized module resolution. */
export function __resetMountWebForTests(): void {
  state = { kind: 'unresolved' };
}

async function resolveHandler(): Promise<ResolvedState> {
  if (state.kind !== 'unresolved') return state;

  const candidates = candidateHandlerPaths();
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const mod = (await import(pathToFileURL(candidate).href)) as HandlerModule;
      const handler = mod.handler ?? mod.default;
      if (typeof handler !== 'function') {
        logger.warn(
          { path: candidate },
          'web handler module loaded but does not export a handler function'
        );
        continue;
      }
      state = { kind: 'ok', handler, path: candidate };
      logger.info({ path: candidate }, 'mounted SvelteKit web handler');
      return state;
    } catch (err) {
      logger.warn({ err, path: candidate }, 'failed to import web handler candidate');
    }
  }

  state = { kind: 'missing' };
  logger.info(
    { candidates },
    'no SvelteKit web build found — non-/api routes will return a placeholder page'
  );
  return state;
}

/**
 * Mount the SvelteKit adapter-node handler as a catch-all for any request that
 * has not matched an earlier route. Must be registered AFTER every /api/* and
 * auth route so the catch-all never shadows them.
 *
 * If the web build is missing, the seam still boots — a helpful 503 HTML page
 * is served instead, so the API can be developed independently of the UI.
 */
export function mountWeb(app: Hono): void {
  app.all('*', async (c) => {
    const resolved = await resolveHandler();

    if (resolved.kind === 'missing') {
      return c.html(PLACEHOLDER_HTML, 503, {
        'Cache-Control': 'no-store',
      });
    }

    // Hand the raw Node req/res to SvelteKit. @hono/node-server exposes these
    // on `c.env`. We wrap the callback in a Promise so Hono awaits completion
    // and the response is fully flushed before the handler resolves.
    const env = c.env as { incoming?: IncomingMessage; outgoing?: ServerResponse };
    const incoming = env.incoming;
    const outgoing = env.outgoing;
    if (!incoming || !outgoing) {
      logger.error('mountWeb invoked without node incoming/outgoing on context env');
      return c.html(PLACEHOLDER_HTML, 503);
    }

    await new Promise<void>((resolvePromise) => {
      let settled = false;
      const settle = (err?: unknown): void => {
        if (settled) return;
        settled = true;
        if (err) logger.warn({ err }, 'web handler error');
        resolvePromise();
      };

      // SvelteKit's adapter-node handler ends the response without calling a
      // next() callback, so we also watch the raw outgoing for termination.
      // `finish` fires on success; `close` covers client disconnects.
      outgoing.on('finish', () => settle());
      outgoing.on('close', () => settle());

      try {
        // Some adapter handlers return a promise, others return void. Accept
        // both and await on the promise branch so async errors are caught.
        const maybePromise: unknown = (
          resolved.handler as unknown as (
            req: IncomingMessage,
            res: ServerResponse,
            next?: (err?: unknown) => void
          ) => unknown
        )(incoming, outgoing, settle);
        if (
          maybePromise !== undefined &&
          maybePromise !== null &&
          typeof (maybePromise as { then?: unknown }).then === 'function'
        ) {
          (maybePromise as Promise<unknown>).then(
            () => settle(),
            (err) => settle(err)
          );
        }
      } catch (err) {
        logger.error({ err }, 'web handler threw synchronously');
        if (!outgoing.headersSent) {
          outgoing.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        if (!outgoing.writableEnded) outgoing.end('Internal Server Error');
        settle(err);
      }
    });

    // Response has already been written to the raw socket by SvelteKit. Return
    // a no-op Response so Hono does not try to write a body of its own.
    return c.body(null);
  });
}
