# Contributing to Prompt Logger

Thanks for your interest in contributing. This project aims to stay **small,
auditable, and vendor-neutral** — please keep those goals in mind when
proposing changes.

## Ground rules

- **Small surface area.** Every new dependency, feature, or config knob is a
  maintenance tax. Prefer removing code over adding it.
- **Permissive licenses only.** New runtime dependencies must be MIT, Apache-2.0,
  ISC, or BSD. No GPL/AGPL/SSPL.
- **No vendor lock-in.** Don't introduce hard dependencies on specific cloud
  providers, managed databases, or proprietary APIs.
- **Security first.** Changes that affect auth, ingest, redaction, or access
  control require extra review. If in doubt, open an issue first.
- **Private by default.** Never weaken the default posture (private sessions,
  OIDC-required viewing, server-side redaction).
- **No telemetry.** The project never phones home.

## Getting started

```bash
git clone https://github.com/<you>/prompt-logger
cd prompt-logger
pnpm install
cp .env.example .env   # fill in values for local dev
pnpm dev
```

You'll need:

- Node.js ≥ 20.11
- pnpm ≥ 9
- An OIDC provider you can point at (a local Authentik or Zitadel container
  is fine for development)

## Development workflow

1. Open an issue describing the change before starting non-trivial work.
2. Fork and branch from `main`.
3. Make your change. Keep commits focused.
4. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before pushing.
5. Open a PR. Fill out the template.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(ingest): add class-code redemption endpoint
fix(sse): reconnect on network recovery
docs(architecture): clarify redaction limitations
```

## Code style

- TypeScript everywhere (except the hook, which is POSIX bash).
- Biome handles lint + format. `pnpm lint` must pass.
- No `any` without a comment explaining why.
- Prefer plain functions over classes.
- Keep components small and focused.

## Reporting bugs

Use the bug report template. Include:

- Version / commit SHA
- How you deployed (Docker, systemd, dev)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (redact secrets)

## Reporting security issues

**Do not** file public issues for security vulnerabilities. See
[`SECURITY.md`](SECURITY.md) for the disclosure process.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
