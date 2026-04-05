# syntax=docker/dockerfile:1.7

# =============================================================================
# Prompt Logger — multi-stage production image (API only)
#
# This image builds only the @prompt-logger/server workspace. The SvelteKit
# web UI (apps/web) is a separate plan (002) and does not have source yet;
# until it does, the server's mount seam serves a placeholder for any
# non-/api/* request. Once apps/web has source, re-enable the web build by
# uncommenting the `apps/web` references below and the `cp -r apps/web/build`
# line in the build stage.
#
# Stages:
#   deps    — install pnpm + fetch dependencies
#   build   — compile the server
#   runtime — distroless Node, minimal surface
# =============================================================================

ARG NODE_VERSION=20.11.1
ARG PNPM_VERSION=9.12.0

# --- Stage 1: deps -----------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
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
# Build the server workspace only. apps/web is skipped until plan 002 lands.
RUN pnpm --filter @prompt-logger/server build

# Prune to production deps only for the server.
RUN pnpm --filter @prompt-logger/server deploy --prod /prod/server

# When apps/web builds, uncomment:
# RUN cp -r apps/web/build /prod/server/web

# --- Stage 3: runtime --------------------------------------------------------
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=nonroot:nonroot /prod/server /app

EXPOSE 3000
USER nonroot
VOLUME ["/data"]

CMD ["dist/index.js"]
