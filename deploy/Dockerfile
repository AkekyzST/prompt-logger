# syntax=docker/dockerfile:1.7

# =============================================================================
# Prompt Logger — multi-stage production image (API + Web UI)
#
# This image builds both workspaces: the Hono API server and the SvelteKit
# web UI. The server's `mount-web.ts` catch-all mounts the adapter-node
# handler copied to `/app/web` at runtime, so a single container serves both
# the JSON API and the client application from the same origin.
#
# Stages:
#   deps    — install pnpm + fetch dependencies for both workspaces
#   build   — compile server + web, then prune to production deps
#   runtime — distroless Node, minimal surface
# =============================================================================

ARG NODE_VERSION=20.11.1
ARG PNPM_VERSION=9.12.0

# --- Stage 1: deps -----------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
# Re-declare the global ARG inside the stage so `${PNPM_VERSION}` is
# substituted in the `RUN` below (Docker scopes ARGs per-stage).
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- Stage 2: build ----------------------------------------------------------
FROM deps AS build
COPY . .
# Build both workspaces. The server emits `apps/server/dist/**`; the web
# workspace emits `apps/web/build/handler.js` via @sveltejs/adapter-node.
RUN pnpm --filter @prompt-logger/server build \
 && pnpm --filter @prompt-logger/web build

# Prune to production deps only for the server, then graft the SvelteKit
# adapter-node build into `/prod/server/web` so `mount-web.ts` finds it at
# `../web/handler.js` relative to `/app/dist/mount-web.js` in the runtime image.
RUN pnpm --filter @prompt-logger/server deploy --prod /prod/server
RUN cp -r apps/web/build /prod/server/web

# --- Stage 3: runtime --------------------------------------------------------
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=nonroot:nonroot /prod/server /app

EXPOSE 3000
USER nonroot
VOLUME ["/data"]

CMD ["dist/index.js"]
