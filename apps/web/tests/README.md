# Web e2e tests

Playwright specs covering the hero viewer flow, admin publish flow, auth
redirects, and an axe-core accessibility sweep.

## Running locally

```bash
# One-time: download the Chromium browser Playwright drives
pnpm --filter @prompt-logger/web test:e2e:install

# Run the full suite (auto-starts the dev server with the test auth bypass)
pnpm --filter @prompt-logger/web test:e2e
```

The config launches `pnpm --filter @prompt-logger/web dev` with
`VITE_TEST_AUTH_BYPASS=1` in the env. This flag is only honoured when
`import.meta.env.DEV === true` inside `hooks.server.ts`, so it cannot leak
into a production bundle. All server API calls are mocked per-test via
`page.route()`; no running backend is required.

## Layout

- `e2e/login.spec.ts` — redirects for unauthenticated users and the sign-in landing
- `e2e/viewer.spec.ts` — hero session viewer, SSE liveness, copy-to-clipboard, keyboard shortcuts
- `e2e/admin-publish.spec.ts` — admin can publish a private session to a tag in ≤ 2 clicks
- `e2e/axe.spec.ts` — axe-core zero-violations sweep across every page
