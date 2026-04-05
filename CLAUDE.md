# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository is **pre-implementation**. It currently contains:

- The authoritative design in `docs/ARCHITECTURE.md` (read this first for any non-trivial change).
- Repository scaffolding: `package.json` workspaces, `apps/server` and `apps/web` manifests, `deploy/` (Dockerfile + compose + Caddyfile), `hook/prompt-logger-hook.sh`, `scripts/backup.sh`, CI, OSS hygiene files.
- **No application source files yet.** `apps/server/src/` and `apps/web/src/` do not exist. When adding code, follow the layout and tech choices described in `docs/ARCHITECTURE.md` §4 and §16.

## Common commands

The project uses **pnpm workspaces**. Node ≥ 20.11, pnpm ≥ 9.

```bash
pnpm install              # install all workspaces
pnpm dev                  # run server + web in parallel (watch)
pnpm build                # build both apps
pnpm start                # run the built server (serves mounted SvelteKit)
pnpm lint                 # Biome check
pnpm format               # Biome format --write
pnpm typecheck            # tsc --noEmit across workspaces
pnpm test                 # Vitest across workspaces

# Single workspace
pnpm --filter @prompt-logger/server dev
pnpm --filter @prompt-logger/web    build

# Single test file / pattern (Vitest)
pnpm --filter @prompt-logger/server test -- src/lib/redact.test.ts
pnpm --filter @prompt-logger/server test -- -t "strips github tokens"

# Database (once implemented)
pnpm --filter @prompt-logger/server db:migrate

# Hook
bash -n hook/prompt-logger-hook.sh                         # syntax check
echo '{"session_id":"t","cwd":"/tmp","prompt":"hi"}' \
  | hook/prompt-logger-hook.sh                             # manual smoke test

# Deploy (from ./deploy)
docker compose up -d
docker compose logs -f app
```

CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm audit`, `shellcheck` on hook + scripts, and a Docker build. Match these locally before pushing.

## Architecture — the parts that span multiple files

### Single Node process, two mounted apps

The server is a **Hono** app that owns `/api/*` routes (ingest, SSE stream, auth callbacks) and mounts **SvelteKit**'s `adapter-node` handler for everything else. One process, one systemd/docker unit. Hono handles the hot path with its own middleware chain (bodyLimit → bearerAuth → rateLimit → zodValidator); SvelteKit handles SSR + UI.

### Ingest → redact → broadcast pipeline

Every prompt goes through one transaction in `POST /api/ingest`:

1. Upsert `sessions` by `claude_session_id` (always created with `visibility='private'`).
2. Redact the prompt **server-side** (`apps/server/src/lib/redact.ts`) — never trust the hook to redact.
3. Insert into `prompts`, storing `content` (redacted) + `raw_hash` (sha256 of original) + `redactions` JSON summary. The original is never persisted.
4. Emit to an in-memory `EventEmitter` keyed by `session_id`.
5. `/api/stream/:id` SSE handlers subscribe to that emitter and forward events to authenticated viewers.

The emitter is the seam between ingest and SSE. Access checks happen at **subscribe time**, not at emit time — once a subscriber is attached, the broadcast path doesn't re-check ACLs.

### Access control (three tiers, one query)

Visibility: `private` / `shared` / `code`. The single access-check query that every protected route runs is in `docs/ARCHITECTURE.md` §5. Any new route that returns session data must run it. **There is no anonymous access anywhere** — every viewer authenticates via OIDC; the only unauthenticated routes are `/login`, `/auth/callback`, static assets, and `/healthz`.

### Data layer

**SQLite (better-sqlite3) in WAL mode + Drizzle** with plain `.sql` migrations. FTS5 virtual table (`prompts_fts`) is the source of truth for search. Schema is in `docs/ARCHITECTURE.md` §5. Keep Drizzle schema and migrations in sync. Do not introduce a second database.

### Auth

**Generic OIDC only**, via `arctic`. Provider is configured entirely by env vars (`OIDC_ISSUER` + client id/secret). Do not add provider-specific code paths. Admin bootstrap is by email allowlist (`ADMIN_EMAILS`). Sessions are server-side: a random opaque token in the cookie, sha256 hashed in `auth_sessions`. Cookies are `HttpOnly + Secure + SameSite=Lax`.

### Hook (client side)

`hook/prompt-logger-hook.sh` is a POSIX bash script that runs on the user's machine, not on the server. Two inviolable rules when editing it:

1. **Always exit 0.** A failing hook must never block Claude Code. There is a `trap 'exit 0' EXIT` at the top — do not remove it.
2. **Never shell-interpolate prompt content.** All JSON is built via `jq`. Prompts can contain arbitrary shell metacharacters.

The network call is backgrounded (`&` + `disown`) so Claude Code never waits. On failure, payloads queue to `~/.local/state/prompt-logger/queue.jsonl` for later replay.

## Design constraints (do not violate without discussion)

These are load-bearing decisions from the design phase. Changing any of them requires updating `docs/ARCHITECTURE.md` in the same PR.

- **Vendor-neutral.** No cloud-provider SDKs, managed-service APIs, or proprietary auth/email/secret-store dependencies. Everything runs on any Linux host.
- **Permissive licenses only** for runtime deps (MIT, Apache-2.0, ISC, BSD). No GPL/AGPL/SSPL.
- **Private by default.** Sessions are created with `visibility='private'`. Never weaken this default.
- **Server-side redaction.** Never move redaction to the hook.
- **No telemetry.** The project never phones home. Observability is opt-in and points at the operator's own OTLP endpoint.
- **One process.** In-memory SSE emitter and in-memory rate limiter assume a single Node process. If horizontal scaling is ever added, both backends must be replaced together.
- **Apache-2.0** licensing for contributions.

## Frontend conventions

The user's global `~/.claude/CLAUDE.md` defines frontend conventions that apply to this project's SvelteKit UI — accessibility (`aria-label`, `aria-live`, focus-visible rings, semantic `<button>` vs `<a>`), `data-slot` attributes with a single root `className`, `max-{breakpoint}:` variants for responsive hiding, `tabular-nums` on numeric columns, `text-wrap: balance` on headings, `transform`/`opacity`-only animations, and URL-reflected state. Follow them when building `apps/web/src/**`.

## Security posture

See `SECURITY.md` for the threat model. Key non-obvious points:

- Ingest token comparison must be **constant-time** (`crypto.timingSafeEqual`).
- Redaction is documented as **best-effort defense-in-depth**, not a guarantee. Never promise stronger semantics in code, docs, or UI copy.
- `raw_hash` exists so you can prove a prompt existed without storing it. Do not add a feature that stores the un-redacted content "just in case."
- CSP in `deploy/Caddyfile.example` is strict (no inline scripts). SvelteKit builds must stay CSP-clean.
- SSE handler must set `X-Accel-Buffering: no` and Caddy's `flush_interval -1` is load-bearing — don't remove either without testing end-to-end streaming behavior.
