#!/usr/bin/env bash
set -euo pipefail
DATA="${KEYANTONG_DATA_ROOT:-/data/keyantong}"
OPT="${KEYANTONG_OPT:-/opt/keyantong}"
mkdir -p "$DATA"/{pg,redis,portal,caddy/data,caddy/config,backups,rnaseq/incoming,rnaseq/jobs,rnaseq/results,rnaseq/refs}
# fix typo path
mkdir -p "$DATA/rnaseq/refs"
chmod +x "$OPT/infra/backup/"*.sh 2>/dev/null || true
cd "$OPT"
PROFILES="${COMPOSE_PROFILES:-}"
EXTRA=()
if [[ -n "$PROFILES" ]]; then
  EXTRA+=(--profile "$PROFILES")
fi
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env "${EXTRA[@]}" up -d --build
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env ps
