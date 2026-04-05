# syntax=docker/dockerfile:1.7

# =============================================================================
# Prompt Logger — multi-stage production image
# Stage 1: deps      — install pnpm + fetch dependencies
# Stage 2: build     — compile server + web (SvelteKit adapter-node)
# Stage 3: runtime   — distroless Node, minimal surface
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
RUN pnpm build

# Prune to production deps only
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
