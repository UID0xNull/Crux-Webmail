# ============================================================================
# Crux-Webmail Backend — Multi-Stage Dockerfile (Node 22 Alpine)
# ============================================================================
# Stage 1: Install all dependencies (shared monorepo)
# Stage 2: Build TypeScript → dist/
# Stage 3: Minimal production image with only prod deps + compiled output
# ============================================================================

# ------------------------------------------------------------------
# Stage 1: Dependencies — install monorepo packages
# ------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Copy root workspace files first (better cache for unchanged deps)
COPY package.json ./

# Server package.json
RUN mkdir -p src/server
COPY src/server/package.json ./src/server/

# Web package.json (needed for workspace resolution)
RUN mkdir -p src/web
COPY src/web/package.json ./src/web/

# Install ALL deps (dev+prod needed for build stage)
RUN npm ci --ignore-scripts

# ------------------------------------------------------------------
# Stage 2: Builder — compile TypeScript
# ------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy deps from stage 1 (cached if package.json unchanged)
COPY --from=deps /app/node_modules ./node_modules

# Copy tsconfigs
COPY package.json ./
COPY tsconfig.base.json ./
COPY tsconfig.json ./

# Copy server sources
COPY src/server/package.json ./src/server/
COPY src/server/tsconfig.json ./src/server/tsconfig.json
COPY src/server/ ./src/server/

# Compile server: src/server/ → src/server/dist/
RUN npm run build:server

# ------------------------------------------------------------------
# Stage 3: Runner — production hardened
# ------------------------------------------------------------------
FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-node-snapshot"

# Non-root user with fixed UID/GID for predictable permissions
ARG USER_ID=1001
RUN addgroup -g ${USER_ID} -S appgroup && \
    adduser -u ${USER_ID} -S appuser -G appgroup

WORKDIR /app

# Copy ONLY production dependencies via package.json + npm ci --production
# Trick: install only prod deps in a fresh env
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/src/server/package.json ./src/server/package.json

RUN npm ci --omit=dev --ignore-scripts && \
    rm -rf ~/.npm && \
    rm -rf /tmp/*

# Compiled backend output — ONLY dist, not sources
COPY --from=builder /app/src/server/dist ./dist

# Certs directory for mTLS (mount at runtime if needed)
RUN mkdir -p /app/certs && chown appuser:appgroup /app/certs

# Drop capabilities
USER appuser

EXPOSE 3000

# Healthcheck: probe Fastify liveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/app.js"]