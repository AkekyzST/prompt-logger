# Prompt Logger

> Self-hosted, real-time web app for capturing, archiving, and sharing Claude Code prompts.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-design-orange.svg)](docs/ARCHITECTURE.md)

**Prompt Logger** captures every prompt you send to Claude Code via a lightweight
shell hook, stores it in SQLite with server-side secret redaction, and streams
it live to authenticated viewers — so you can share your prompts with students,
colleagues, or collaborators without giving away the underlying conversation.

Built for teachers who want their class to watch AI-assisted development happen
in real time, then browse the archive afterward.

## Features

- **Real-time streaming** — prompts appear in viewers' browsers the moment you hit enter (via Server-Sent Events).
- **Persistent archive** — every session is searchable (SQLite FTS5) and permalinkable.
- **Private by default** — every session starts private. Nothing is visible until you explicitly publish it.
- **Three visibility tiers** — private / shared with specific users / class-coded.
- **Generic OIDC login** — works with any OIDC provider (Google, GitHub, Authentik, Keycloak, Zitadel, …). No vendor lock-in.
- **Server-side secret redaction** — strips AI keys, GitHub tokens, AWS keys, JWTs, PEM blocks, and `.env`-style lines before persisting.
- **No anonymous access** — every viewer authenticates; every view is attributable and revocable.
- **Tiny, auditable** — ~800 lines of TypeScript, ~60 lines of shell. No telemetry.
- **One Linux host** — `docker compose up -d` behind Caddy. Runs anywhere.

## Status

This repository currently contains the design document and scaffold. Implementation
is in progress. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full
design.

## Quick start (once implemented)

```bash
git clone https://github.com/<you>/prompt-logger
cd prompt-logger/deploy
cp .env.example .env
# edit .env — set PUBLIC_BASE_URL, OIDC_*, INGEST_TOKEN, ADMIN_EMAILS
docker compose up -d
```

Then on your dev machine:

```bash
cd prompt-logger/hook
./install-hook.sh   # prompts for URL + token
```

Add the printed JSON snippet to `~/.claude/settings.json` under `hooks.UserPromptSubmit`,
then start using Claude Code normally. Your prompts will appear at
`https://prompts.example.com/admin`.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the complete design.

- **Server:** Hono + SvelteKit (mounted) + better-sqlite3 + Drizzle
- **UI:** shadcn-svelte + Tailwind v4 + Lucide
- **Auth:** Generic OIDC via `arctic`
- **Transport:** Server-Sent Events for live updates
- **Deploy:** Docker Compose + Caddy (nginx example also shipped)

## Security

See [`SECURITY.md`](SECURITY.md) for the threat model and vulnerability disclosure policy.

**Important:** server-side redaction is *best-effort defense-in-depth*, not a
guarantee. Do not paste production secrets into Claude Code and expect this tool
to save you.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

[Apache License 2.0](LICENSE)
