# @prompt-logger/web

SvelteKit UI for Prompt Logger. In production it's mounted same-origin by the
Hono server (`apps/server`) via `adapter-node`'s `build/handler.js`. In dev the
UI and API run on separate ports and the UI forwards the `pl_sess` session
cookie from every incoming request.

## Dev

```bash
# 1. start the API (separate terminal)
pnpm --filter @prompt-logger/server dev   # serves http://localhost:3000

# 2. start the UI
pnpm --filter @prompt-logger/web dev      # serves http://localhost:5173
```

## Environment

| Variable          | Default                  | Purpose                                                                 |
| ----------------- | ------------------------ | ----------------------------------------------------------------------- |
| `VITE_API_ORIGIN` | `http://localhost:3000`  | Dev-only. Where `lib/api/client.ts` forwards requests when `dev=true`.  |

In production `VITE_API_ORIGIN` is ignored: the UI talks to the API on the
same origin via relative paths.

## Scripts

```bash
pnpm --filter @prompt-logger/web typecheck
pnpm --filter @prompt-logger/web build
pnpm --filter @prompt-logger/web test
```
