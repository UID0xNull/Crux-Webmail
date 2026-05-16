# ============================================================================
# Crux-Webmail Frontend — Next.js 15 Multi-Stage Dockerfile
# ============================================================================
# Stage 1: Install deps (monorepo workspaces)
# Stage 2: Build Next.js (SSR + standalone output)
# Stage 3: Minimal production runner
# ============================================================================

# ------------------------------------------------------------------
# Stage 1: Dependencies
# ------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Copy workspace manifests first (best cache hit ratio)
COPY package.json ./
COPY package-lock.json ./

RUN mkdir -p src/server src/web
COPY src/server/package.json ./src/server/
COPY src/web/package.json ./src/web/

RUN npm ci --ignore-scripts

# ------------------------------------------------------------------
# Stage 2: Builder
# ------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# Build-time env
ENV NEXT_TELEMETRY_DISABLED=1

# Copy config + sources
COPY package.json ./
COPY tsconfig.base.json ./
COPY tsconfig.json ./
COPY src/web/ ./src/web/

# Build inside src/web — outputs to .next/
WORKDIR /app/src/web
RUN npm run build

# ------------------------------------------------------------------
# Stage 3: Runner — standalone production
# ------------------------------------------------------------------
FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

ARG USER_ID=1001
RUN addgroup -g ${USER_ID} -S appgroup && \
    adduser -u ${USER_ID} -S appuser -G appgroup

WORKDIR /app

# Copy standalone output (next-standalone: minimal server)
COPY --from=builder /app/src/web/.next/standalone ./

# Copy static assets + public
COPY --from=builder /app/src/web/.next/static ./src/web/.next/static
COPY --from=builder /app/src/web/public ./src/web/public

USER appuser

EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3001/health || exit 1

CMD ["node", "src/web/server.js"]