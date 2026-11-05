FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/portal/package.json apps/portal/
COPY packages/ops-shared/package.json packages/ops-shared/
COPY packages/contracts/package.json packages/contracts/
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /app/packages/ops-shared/node_modules ./packages/ops-shared/node_modules
COPY apps/admin ./apps/admin
COPY packages/ops-shared ./packages/ops-shared
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/portal/package.json apps/portal/
COPY packages/contracts/package.json packages/contracts/
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --dir apps/admin build
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
USER 1001:1001
CMD ["node","apps/admin/server.js"]
