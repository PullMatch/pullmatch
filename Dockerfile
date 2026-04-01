# ─── Stage 1: Install dependencies ───────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# Copy workspace config and package manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --prod

# ─── Stage 2: Production image ───────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache curl \
    && addgroup -S pullmatch && adduser -S pullmatch -G pullmatch

WORKDIR /app

ENV NODE_ENV=production

# Copy installed dependencies
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api/node_modules /app/apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules /app/packages/shared/node_modules

# Copy workspace config
COPY package.json pnpm-workspace.yaml ./

# Copy source (TypeScript executed via --experimental-strip-types)
COPY apps/api/package.json apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src

RUN chown -R pullmatch:pullmatch /app

USER pullmatch

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

WORKDIR /app/apps/api

CMD ["node", "--experimental-strip-types", "src/index.ts"]
