# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report them privately via one of:

1. GitHub's private vulnerability reporting (Security tab → Report a vulnerability)
2. Email to the maintainer listed in the repository metadata

We aim to acknowledge reports within 72 hours and ship a fix within 14 days for
critical issues.

## Scope

In scope:

- The server application (`apps/server`)
- The web UI (`apps/web`)
- The Claude Code hook (`hook/`)
- The deployment configuration (`deploy/`)

Out of scope:

- Vulnerabilities in upstream dependencies (report those upstream; we will pull
  fixed versions once released)
- Attacks that require physical access to the host
- Social engineering against operators

## Threat model

This project is a **self-hosted, single-owner** service with three classes of
principal:

| Principal | Capabilities |
|---|---|
| **Admin** (one user) | Full read/write via OIDC login. Can publish, revoke, delete, manage users and class codes. |
| **Authenticated viewer** | Read-only access to sessions explicitly granted to them (via ACL or redeemed class code). |
| **Hook client** | Write-only access to `/api/ingest` via a shared bearer token. No read access. |
| **Anonymous** | Can reach `/login` and `/auth/callback` only. Nothing else. |

### Assets

1. Prompt content (potentially sensitive: code, ideas, partial secrets).
2. The ingest bearer token (allows writing arbitrary prompts into the log).
3. OIDC client secret.
4. Admin session cookies.
5. The SQLite database file.

### Mitigations in place

- **Transport:** HTTPS-only via Caddy with HSTS, strict CSP, and hardening
  headers.
- **Auth:** Generic OIDC via `arctic` with PKCE. No passwords stored. Sessions
  are server-side (opaque random token, `HttpOnly` + `Secure` + `SameSite=Lax`).
- **Ingest auth:** Constant-time bearer token comparison. Token stored
  `chmod 600` in a user config file on the client side.
- **Rate limiting:** `/api/ingest` is rate-limited at both the Caddy layer and
  the app layer (60 req/min per IP by default).
- **Secret redaction:** Server-side regex-based stripping of AI keys, GitHub
  tokens, AWS keys, Slack tokens, JWTs, PEM blocks, and `.env`-style lines
  before persistence. `raw_hash` (sha256) is stored for audit without the
  original content.
- **Private by default:** Every session starts private. Nothing is visible to
  any viewer until explicitly published.
- **No anonymous viewers:** Every view is attributable to an authenticated
  user and revocable.
- **XSS:** Svelte auto-escapes all content. Prompt bodies are rendered as
  text, never as HTML. No `{@html}` in the codebase.
- **CSRF:** SvelteKit's built-in CSRF protection is enabled. Form actions
  verify origin.
- **Supply chain:** Minimal dependencies, permissive licenses only, `npm audit`
  in CI, lockfile committed.
- **No telemetry:** The project never phones home. Observability is opt-in and
  points at the operator's own OTLP endpoint.

### Known limitations (documented, not bugs)

- **Redaction is best-effort.** Regex-based stripping cannot catch every
  possible secret. Do not paste production credentials into Claude Code and
  expect this tool to save you. Treat the ingest pipeline as *defense-in-depth*
  on top of good key-hygiene.
- **In-memory rate limiting** does not work across multiple replicas. The
  reference deployment runs a single Node process. If you scale horizontally,
  swap the rate-limiter backend.
- **A compromised hook client** can submit arbitrary prompts attributed to you.
  Rotate `INGEST_TOKEN` if a machine running the hook is lost or compromised.
