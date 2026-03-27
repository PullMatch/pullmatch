FROM node:22-alpine AS deps

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN cat > pnpm-workspace.yaml <<'WORKSPACE'
packages:
  - apps/*
  - packages/*
WORKSPACE

RUN pnpm install --prod --filter @pullmatch/api --filter @pullmatch/shared

COPY apps/api/src apps/api/src
COPY packages/shared/src packages/shared/src

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/package.json /app/package.json
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/api /app/apps/api
COPY --from=deps /app/packages/shared /app/packages/shared

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "--experimental-strip-types", "src/index.ts"]
