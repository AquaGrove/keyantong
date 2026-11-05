#!/usr/bin/env bash
set -euo pipefail
DATA="${KEYANTONG_DATA_ROOT:-/data/keyantong}"
OPT="${KEYANTONG_OPT:-/opt/keyantong}"
# Portal container runs as uid/gid 1001 (nextjs/nodejs). Host bind mounts must be writable by that user.
PORTAL_UID="${KEYANTONG_PORTAL_UID:-1001}"
PORTAL_GID="${KEYANTONG_PORTAL_GID:-1001}"
mkdir -p "$DATA"/{pg,redis,portal,caddy/data,caddy/config,backups,rnaseq/incoming,rnaseq/jobs,rnaseq/results,rnaseq/refs,harness}
mkdir -p "$DATA/rnaseq/refs"
# Ensure portal (and other node-written paths) are writable inside the container
if command -v chown >/dev/null 2>&1; then
  chown -R "${PORTAL_UID}:${PORTAL_GID}" "$DATA/portal" "$DATA/rnaseq/incoming" "$DATA/rnaseq/jobs" "$DATA/rnaseq/results" 2>/dev/null || true
fi
chmod +x "$OPT/infra/backup/"*.sh 2>/dev/null || true
cd "$OPT"
PROFILES="${COMPOSE_PROFILES:-}"
EXTRA=()
if [[ -n "$PROFILES" ]]; then
  EXTRA+=(--profile "$PROFILES")
fi
COMPOSE=(-f infra/docker-compose.prod.yml)
# A migrated deployment must always include the runtime identity credentials.
if [[ -f "${KT_STORAGE_SECRETS_DIR:-$DATA/storage-secrets}/portal.env" ]]; then
  COMPOSE+=(-f infra/docker-compose.storage.yml)
fi
if [[ -f "$DATA/storage-secrets/omics-enabled" ]]; then
  docker build -f services/omics/Dockerfile -t keyantong-omics:20261105 .
  COMPOSE+=(-f infra/docker-compose.omics.yml)
fi
if [[ -f "$DATA/storage-secrets/conversation-enabled" ]]; then
  COMPOSE+=(-f infra/docker-compose.conversation.yml)
fi
if [[ -f "$DATA/storage-secrets/closed-loop-enabled" ]]; then
  COMPOSE+=(-f infra/docker-compose.closed-loop.yml)
fi
docker compose "${COMPOSE[@]}" --env-file infra/.env "${EXTRA[@]}" up -d --build
docker compose "${COMPOSE[@]}" --env-file infra/.env ps
