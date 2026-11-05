# KeyanTong portal — multi-stage production image (pnpm monorepo)
# Build from repo root: docker build -f apps/portal/Dockerfile -t keyantong-portal .

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/portal/package.json apps/portal/
COPY packages/ops-shared/package.json packages/ops-shared/
COPY packages/contracts/package.json packages/contracts/
# Admin not needed for portal image but workspace may resolve; keep lockfile happy
COPY apps/admin/package.json apps/admin/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/portal/node_modules ./apps/portal/node_modules
COPY --from=deps /app/packages/ops-shared/node_modules ./packages/ops-shared/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/portal ./apps/portal
COPY packages/ops-shared ./packages/ops-shared
COPY packages/contracts ./packages/contracts
COPY apps/admin/package.json apps/admin/
COPY catalog ./catalog
# Optional small helper used by NCBI local-pack path resolution
COPY services/ncbi-upload ./services/ncbi-upload
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Build-time public defaults (overridden at runtime for most; NEXT_PUBLIC_* baked in)
ARG NEXT_PUBLIC_SITE_URL=https://keyantong.online
ARG NEXT_PUBLIC_GITHUB_OWNER=AquaGrove
ARG NEXT_PUBLIC_GITHUB_REPO=keyantong
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_GITHUB_OWNER=$NEXT_PUBLIC_GITHUB_OWNER
ENV NEXT_PUBLIC_GITHUB_REPO=$NEXT_PUBLIC_GITHUB_REPO
RUN pnpm --dir apps/portal build

# Operational image: migrations and dispatcher, not used by the public portal.
FROM builder AS operations
ENV NODE_ENV=production
WORKDIR /app/apps/portal
CMD ["node", "--import", "tsx", "db/scripts/dispatch.ts"]

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# Next standalone traces monorepo layout under apps/portal
COPY --from=builder /app/apps/portal/.next/standalone ./
COPY --from=builder /app/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=builder /app/apps/portal/public ./apps/portal/public
# Catalog + ncbi helpers for runtime file lookups relative to cwd
COPY --from=builder /app/catalog ./catalog
COPY --from=builder /app/services/ncbi-upload ./services/ncbi-upload
# Also place catalog next to portal cwd fallbacks
COPY --from=builder /app/catalog ./apps/portal/catalog
RUN mkdir -p /data && chown -R nextjs:nodejs /data /app
USER nextjs
EXPOSE 3000
# DATA_DIR mounted at /data/portal in compose
ENV DATA_DIR=/data/portal
CMD ["node", "apps/portal/server.js"]
