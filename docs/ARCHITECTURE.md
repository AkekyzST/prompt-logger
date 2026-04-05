# Prompt Logger — Architecture

> **Status:** design, pre-implementation
> **Last updated:** 2026-04-05
> **License:** Apache-2.0

## 1. What it is

Prompt Logger is an open-source, self-hosted web app that:

1. Captures Claude Code prompts via a lightweight shell hook on the user's machine.
2. Stores them in SQLite with server-side secret redaction.
3. Streams them live over Server-Sent Events (SSE) to authenticated viewers.
4. Lets the owner publish sessions privately, to specific users, or to a class
   via redeemable codes.

It is **vendor-neutral by design.** Every external dependency is swappable,
every secret lives in env vars, and no telemetry is phoned home.

## 2. Goals & non-goals

**Goals**

- Real-time live view of prompts during class demos.
- Persistent, searchable archive of past sessions.
- Strong default privacy (everything private until explicitly published).
- Minimal ops: one process, one database file, one reverse proxy.
- Runs on any Linux host. No cloud lock-in.
- Small, auditable codebase (~800 lines of TypeScript + ~60 lines of shell).

**Non-goals**

- Multi-tenant SaaS. One instance = one owner.
- Rich collaboration (comments, reactions, threads).
- Capturing Claude's responses verbatim by default (opt-in mode only).
- Replacing proper observability tooling for AI apps.
- Guaranteeing secret redaction. Redaction is best-effort defense-in-depth.

## 3. High-level architecture

```
┌─────────────────────┐         ┌─────────────────────────────────┐
│  Your dev machine   │         │        Linux VM (public)        │
│                     │         │                                 │
│  Claude Code        │  HTTPS  │   Caddy (TLS, HSTS, headers,    │
│   │ UserPromptSubmit│ ──────▶ │   rate-limit on /api/ingest)    │
│   │ hook → POST     │         │            │                    │
│   └─────────────────┘         │   ┌────────▼──────────────┐     │
│                               │   │  Node process          │     │
│  Viewers' browsers   ◀──SSE── │   │   Hono (outer)         │     │
│  (OIDC-authenticated)         │   │    /api/ingest         │     │
│                               │   │    /api/stream/:id     │     │
│  Admin browser       ◀──────▶ │   │    /auth/*             │     │
│  (OIDC-authenticated)         │   │   SvelteKit (mounted)  │     │
│                               │   │    SSR + shadcn-svelte │     │
│                               │   │   better-sqlite3       │     │
│                               │   │    prompts.db (WAL)    │     │
│                               │   └────────────────────────┘     │
│                               │     systemd / docker compose    │
└───────────────────────────────┴─────────────────────────────────┘
```

Four moving parts: **Node app, SQLite file, Caddy, hook script.**

### Request flows

1. **Ingest** — Hook POSTs `{claude_session_id, cwd, prompt, ...}` to
   `/api/ingest` with a bearer token. Hono validates token → rate-limits →
   redacts → inserts row → broadcasts to in-memory SSE subscribers → 200 OK.
   The hook runs in the background so Claude Code never blocks.
2. **Live view** — Browser hits `/s/:id`. SvelteKit SSRs the initial HTML
   (last 50 prompts from DB). Client opens `EventSource('/api/stream/:id')`.
   Server pushes each new prompt as `event: prompt`.
3. **Admin** — `/admin`. OIDC redirect → session cookie → list sessions,
   publish/unpublish, manage users, class codes, audit log.

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| HTTP server | **Hono** | Tiny, fast, great middleware model. Owns `/api/*` and mounts SvelteKit's Node handler for everything else. |
| UI framework | **SvelteKit** | Full-stack TS, SSR, form actions, built-in CSRF, excellent AI-codegen support. |
| UI components | **shadcn-svelte** | Copied into the repo, not a runtime dep. Apache/MIT. Zero lock-in. |
| Styling | **Tailwind CSS v4** | Minimal config, first-class dark mode. |
| Icons | **Lucide** | ISC license, tree-shakeable. |
| Database | **SQLite (better-sqlite3)** in WAL mode | One file, zero ops, FTS5 built in, fast enough for 10 000× this workload. |
| ORM | **Drizzle** | MIT, compiles to plain SQL, you can drop it and keep the migrations. |
| Auth | **Generic OIDC via `arctic`** | Works with any `.well-known/openid-configuration` issuer. Google, GitHub, Authentik, Keycloak, Zitadel, Auth0, Authelia, Dex. |
| Validation | **Zod** | Schema-based, used for env, ingest, and form inputs. |
| Logging | **pino** | Structured JSON to stdout. |
| Observability | **OpenTelemetry (optional)** | Only emits if `OTEL_EXPORTER_OTLP_ENDPOINT` is set. |
| Reverse proxy | **Caddy** (nginx example also shipped) | Auto TLS, security headers, one-line rate limit. |
| Package manager | **pnpm workspaces** | No extra monorepo tool. |
| Language | **TypeScript** everywhere | Except the hook, which is POSIX bash (+ a PowerShell twin). |
| License | **Apache-2.0** | Patent grant protects contributors. |

## 5. Data model

All timestamps UTC ISO strings. All IDs ULIDs except `users.id` which is the
OIDC `sub` claim.

```sql
users (
  id            TEXT PRIMARY KEY,   -- OIDC sub
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL,      -- 'admin' | 'viewer'
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

sessions (
  id                   TEXT PRIMARY KEY,        -- ULID
  claude_session_id    TEXT UNIQUE,             -- from hook payload
  title                TEXT NOT NULL,           -- "2026-04-05 14:32 · Session 7"
  seq                  INTEGER NOT NULL,        -- running counter
  tag                  TEXT,                    -- 'cs101-lec4'
  visibility           TEXT NOT NULL,           -- 'private'|'shared'|'code'
  cwd                  TEXT,
  first_prompt_preview TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  closed_at            TEXT                     -- NULL = still live
);

prompts (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq          INTEGER NOT NULL,
  role         TEXT NOT NULL,                   -- 'user' | 'assistant'
  content      TEXT NOT NULL,                   -- redacted
  raw_hash     TEXT,                            -- sha256(original)
  redactions   TEXT,                            -- JSON: [{type,count}]
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_prompts_session_seq ON prompts(session_id, seq);

CREATE VIRTUAL TABLE prompts_fts USING fts5(
  content, session_id UNINDEXED,
  content=prompts, content_rowid=rowid
);

session_grants (
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id)    ON DELETE CASCADE,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

class_codes (
  code       TEXT PRIMARY KEY,                  -- 'cs101-fall26'
  tag        TEXT NOT NULL,                     -- matches sessions.tag
  label      TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

code_redemptions (
  code        TEXT REFERENCES class_codes(code) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id)         ON DELETE CASCADE,
  redeemed_at TEXT NOT NULL,
  PRIMARY KEY (code, user_id)
);

auth_sessions (
  token_hash TEXT PRIMARY KEY,                  -- sha256(cookie value)
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT,
  ip         TEXT
);
```

### The one access-check query

```sql
SELECT 1 FROM sessions s WHERE s.id = :sid AND (
     :role = 'admin'
  OR (s.visibility = 'shared' AND EXISTS (
       SELECT 1 FROM session_grants g
       WHERE g.session_id = s.id AND g.user_id = :uid))
  OR (s.visibility = 'code' AND EXISTS (
       SELECT 1 FROM code_redemptions r
       JOIN class_codes c ON c.code = r.code
       WHERE r.user_id = :uid AND c.tag = s.tag
         AND (c.expires_at IS NULL OR c.expires_at > :now)))
);
```

## 6. Visibility model

| Tier | Who can view | Use case |
|---|---|---|
| **Private** (default) | Only the admin | Personal projects, drafts, anything with secrets |
| **Shared (ACL)** | Specific email-allowlisted users | Colleagues, research partners, 1:1 mentoring |
| **Class-coded** | Any authenticated user who has redeemed a matching class code | Students in a class |

**No anonymous access.** Every viewer must authenticate via OIDC. Every view
is attributable and revocable.

## 7. The Claude Code hook

Runs on the user's machine. Registered in `~/.claude/settings.json` under
`UserPromptSubmit`. Optional `Stop` hook for prompt+response mode.

**Properties:**

- POSIX bash (~60 lines) + PowerShell twin for Windows.
- Reads Claude Code's JSON payload from stdin (`session_id`, `cwd`, `prompt`).
- Config lives in `~/.config/prompt-logger/config.env` (`chmod 600`):
  `PROMPT_LOGGER_URL`, `PROMPT_LOGGER_TOKEN`, `PROMPT_LOGGER_MODE`.
- POSTs to `$URL/api/ingest` with `Authorization: Bearer $TOKEN`.
- Uses `jq` to build JSON (never shell-interpolates prompt content).
- 2 s connect / 5 s total timeout.
- Runs in the background with `&` + `disown` — **never blocks Claude Code**.
- Always exits 0. A failing hook must never break your workflow.
- HTTPS enforced unless `PROMPT_LOGGER_ALLOW_INSECURE=1` (dev only).
- Payload capped at 256 KB; larger prompts are truncated with a marker.
- Optional on-disk queue at `~/.local/state/prompt-logger/queue.jsonl` for
  offline buffering; `install-hook.sh flush` drains it.

## 8. Ingest pipeline

`POST /api/ingest` — middleware chain:

1. `bodyLimit(256 KB)` — reject log bombs.
2. `bearerAuth(INGEST_TOKEN)` — constant-time compare.
3. `rateLimit(60/min per IP)` — token-bucket in memory.
4. `zodValidator(ingestSchema)` — strict shape.
5. Handler: in one SQLite transaction —
   - upsert session by `claude_session_id` (title, seq, visibility=private)
   - redact prompt → store `content`, `raw_hash`, `redactions` JSON
   - insert prompt row with next `seq`
   - emit to in-memory `EventEmitter` keyed by `session_id`
   - return `201 {id, seq}`

Whole path runs in ~15 ms on a cheap VM.

## 9. Redaction

Server-side only. Defined in `apps/server/src/lib/redact.ts`. Defaults:

| Pattern | Replacement |
|---|---|
| Anthropic / OpenAI keys (`sk-…`, `sk-ant-…`) | `[REDACTED:ai-key]` |
| GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`) | `[REDACTED:github-token]` |
| AWS access keys (`AKIA…` + nearby secret) | `[REDACTED:aws-key]` |
| Slack tokens (`xox[baprs]-…`) | `[REDACTED:slack-token]` |
| JWTs | `[REDACTED:jwt]` |
| PEM private key blocks | `[REDACTED:private-key]` |
| `.env`-style `KEY=value` blocks | `[REDACTED:env-var]` |
| Email addresses (optional, off by default) | `[REDACTED:email]` |
| `REDACTION_EXTRA_PATTERNS` (user JSON) | user-defined |

**Critical properties:**

- Redaction runs **server-side**, never trusted to the hook.
- `raw_hash` (sha256) lets you prove a prompt existed without storing it.
- Admin UI surfaces redaction hits per prompt (`[3 secrets stripped]`).
- Documented as **best-effort**. See `SECURITY.md`.

## 10. Live streaming (SSE)

`GET /api/stream/:sessionId`:

1. Session cookie → user → access-check query.
2. `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
   `X-Accel-Buffering: no`.
3. Initial `event: snapshot` with last N prompts.
4. Subscribe to in-memory emitter; forward each new prompt.
5. Heartbeat comment `:\n\n` every 15 s.
6. On disconnect: unsubscribe, free listener.
7. Global cap: `SSE_MAX_CONNECTIONS` (default 500).

**Why SSE, not WebSockets:** one-way fits the use case, works through every
proxy without upgrade negotiation, auto-reconnects in the browser for free,
server code is ~30 lines.

## 11. UI surfaces

```
Public (login required):
  /login                    OIDC kickoff
  /auth/callback            OIDC return
  /logout

Viewer (any authenticated user):
  /                         Your accessible sessions
  /s/:sessionId             Single session (live or archived)
  /c/:tag                   All sessions for a tag
  /join                     Redeem a class code
  /me                       Profile + accessible classes

Admin (role=admin only):
  /admin                    Dashboard: live + recent
  /admin/sessions           Full list + FTS search + bulk actions
  /admin/sessions/:id       Edit: title, tag, visibility, ACL
  /admin/users              Allowlist editor, promote/demote
  /admin/codes              Class codes: create, expire, redemptions
  /admin/settings           View config, redaction rules
  /admin/audit              Audit log
```

Single-session viewer is the focal page: monospace prompt bodies, one-click
copy per prompt, live `●` indicator, auto-scroll-unless-scrolled-up, keyboard
nav (`j`/`k`/`c`/`G`), `aria-live="polite"` on the stream container.

Follow `CLAUDE.md` conventions throughout: semantic elements, visible focus
rings, `tabular-nums` on numbers, `text-wrap: balance` on headings, no
`outline: none` without replacement.

## 12. Deployment

Canonical deploy is `docker compose up -d` with two services:

- `app` — the Node container, `./data:/data` volume for SQLite.
- `caddy` — reverse proxy, automatic HTTPS, security headers, rate limit.

Alternative: systemd unit + `node build` (example shipped under
`deploy/systemd/`). nginx config also shipped for users who prefer it.

All configuration is env vars. See `.env.example`.

## 13. Backups

`scripts/backup.sh` uses SQLite's online backup API:

```bash
sqlite3 "$DB" ".backup $BACKUP_DIR/$(date +%F).db"
```

Safe while the app is running. Cron line documented in the README. Users can
layer restic/borg/rclone on top; the project does not assume any.

## 14. Observability

- **Default:** structured JSON logs to stdout via pino.
- **Optional:** set `OTEL_EXPORTER_OTLP_ENDPOINT` → traces + metrics exported
  via OpenTelemetry. Works with Tempo, Jaeger, SigNoz, Honeycomb, any OTLP.
- **Zero telemetry** phoned home from the project itself.

## 15. Security posture

See `SECURITY.md` for the full threat model. Summary:

- HTTPS-only via Caddy, HSTS preload-ready, strict CSP.
- OIDC-only auth, no passwords stored, server-side session store.
- Ingest auth via bearer token in a `chmod 600` file.
- Rate limit on `/api/ingest` at both Caddy and app layers.
- Server-side redaction as defense-in-depth (not a guarantee).
- Constant-time token comparison.
- No anonymous viewers.
- Audit log for admin actions and viewer session opens.
- Supply chain: permissive licenses only, minimal deps, `npm audit` in CI.
- Private by default at every layer.

## 16. Repository layout

```
prompt-logger/
├── apps/
│   ├── server/          # Hono + Drizzle + SQLite
│   └── web/             # SvelteKit + shadcn-svelte
├── hook/                # shell hook + installer
├── deploy/              # Dockerfile, compose, Caddyfile, systemd
├── docs/                # ARCHITECTURE, SECURITY, OIDC, HOOK
├── scripts/             # backup, restore
├── .github/             # workflows, templates
├── LICENSE              # Apache-2.0
├── README.md
├── SECURITY.md          # disclosure policy
├── CODE_OF_CONDUCT.md   # Contributor Covenant 2.1
├── CONTRIBUTING.md
├── package.json         # workspace root
└── pnpm-workspace.yaml
```

## 17. Open questions / future work

- Prompt-and-response mode (opt-in `Stop` hook) needs reconciliation logic
  when prompts fail to persist but responses arrive.
- Export: per-session Markdown/PDF download for archival.
- Import: retroactive bulk import of `~/.claude/projects/**/*.jsonl` history.
- Search UX: pagination, highlight snippets via FTS5 `snippet()`.
- Rate-limit backend: currently in-memory; swap for SQLite-backed bucket if
  running multiple replicas (which you probably shouldn't — use one node).
