import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __resetMountWebForTests, mountWeb } from './mount-web.js';

const ORIGINAL_OVERRIDE = process.env.PROMPT_LOGGER_WEB_HANDLER;

function freshApp(): Hono {
  const app = new Hono();
  app.get('/api/ping', (c) => c.json({ ok: true }));
  mountWeb(app);
  return app;
}

describe('mountWeb', () => {
  beforeEach(() => {
    __resetMountWebForTests();
  });

  afterEach(() => {
    __resetMountWebForTests();
    if (ORIGINAL_OVERRIDE === undefined) process.env.PROMPT_LOGGER_WEB_HANDLER = undefined;
    else process.env.PROMPT_LOGGER_WEB_HANDLER = ORIGINAL_OVERRIDE;
  });

  it('serves the placeholder 503 HTML when no web build is present', async () => {
    // Point the override at a path that definitely does not exist.
    process.env.PROMPT_LOGGER_WEB_HANDLER = join(
      tmpdir(),
      `prompt-logger-nope-${Date.now()}`,
      'handler.js'
    );

    const app = freshApp();
    const res = await app.request('/');

    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain('Web UI not built');
    expect(body).toContain('pnpm --filter @prompt-logger/web build');
    expect(body).toContain('/api/*');
  });

  it('does not intercept /api/* routes', async () => {
    process.env.PROMPT_LOGGER_WEB_HANDLER = join(
      tmpdir(),
      `prompt-logger-nope-${Date.now()}`,
      'handler.js'
    );

    const app = freshApp();
    const res = await app.request('/api/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('delegates to a mock handler when a web build is present', async () => {
    // Build a throwaway ESM module that behaves like SvelteKit's handler.js:
    // exports a `handler(req, res)` that writes a known response to res.
    const dir = mkdtempSync(join(tmpdir(), 'prompt-logger-web-'));
    const handlerPath = join(dir, 'handler.js');
    writeFileSync(
      handlerPath,
      `export function handler(req, res) {
         res.statusCode = 200;
         res.setHeader('Content-Type', 'text/plain');
         res.setHeader('X-Mock-Handler', 'yes');
         res.end('hello from mock sveltekit');
       }
       export default handler;
      `
    );
    process.env.PROMPT_LOGGER_WEB_HANDLER = handlerPath;

    try {
      const app = freshApp();

      // Hono's app.request path uses Fetch-API Request/Response, so there is
      // no raw Node incoming/outgoing available. Invoke the context path that
      // mountWeb takes by building a matching env — this exercises the same
      // happy-path branch that @hono/node-server would hit in production.
      const chunks: Buffer[] = [];
      let statusCode = 0;
      const headers: Record<string, string> = {};
      let ended = false;

      const fakeOutgoing = Object.assign(new EventEmitter(), {
        headersSent: false,
        writableEnded: false,
        statusCode: 200,
        setHeader(name: string, value: string) {
          headers[name.toLowerCase()] = value;
        },
        getHeader(name: string) {
          return headers[name.toLowerCase()];
        },
        writeHead(status: number, hdrs?: Record<string, string>) {
          statusCode = status;
          if (hdrs) for (const [k, v] of Object.entries(hdrs)) headers[k.toLowerCase()] = v;
        },
        write(chunk: string | Buffer) {
          chunks.push(Buffer.from(chunk));
          return true;
        },
        end(chunk?: string | Buffer) {
          if (chunk) chunks.push(Buffer.from(chunk));
          if (statusCode === 0) statusCode = this.statusCode;
          this.writableEnded = true;
          ended = true;
          // Simulate the real Node ServerResponse: fire 'finish' on end().
          queueMicrotask(() => this.emit('finish'));
        },
      });

      const fakeIncoming = { url: '/', method: 'GET', headers: {} };

      const res = await app.fetch(new Request('http://localhost/'), {
        incoming: fakeIncoming,
        outgoing: fakeOutgoing,
      });

      // Hono returns an empty Response body because mountWeb wrote the real
      // payload directly onto the raw socket (our fake outgoing).
      expect(res.status).toBe(200);
      expect(ended).toBe(true);
      expect(statusCode).toBe(200);
      expect(headers['x-mock-handler']).toBe('yes');
      const body = Buffer.concat(chunks).toString('utf8');
      expect(body).toBe('hello from mock sveltekit');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
