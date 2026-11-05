#!/usr/bin/env bash
# Restore backup.sh output onto this or a new host.
set -euo pipefail
BACKUP_DIR="${1:-}"
if [[ -z "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  echo "Usage: $0 /path/to/backup-dir" >&2
  exit 1
fi
ROOT="${KEYANTONG_DATA_ROOT:-/data/keyantong}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/keyantong/infra/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/keyantong/infra/.env}"
echo "[restore] from $BACKUP_DIR → $ROOT"
mkdir -p "$ROOT"
if [[ -f "$BACKUP_DIR/dotenv.encopy" ]]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  cp -a "$BACKUP_DIR/dotenv.encopy" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
set -a; source "$ENV_FILE"; set +a
PGUSER="${POSTGRES_USER:-kt}"
PGDB="${POSTGRES_DB:-keyantong}"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down || true
TGZ="$BACKUP_DIR/data-volumes.tgz"
[[ -f "$TGZ" ]] || TGZ="$BACKUP_DIR/data-portal-redis-caddy.tgz"
if [[ -f "$TGZ" ]]; then
  tar -C "$ROOT" -xzf "$TGZ"
fi
mkdir -p "$ROOT/pg" "$ROOT/backups" "$ROOT/rnaseq"/{incoming,jobs,results,refs}
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres
sleep 5
if [[ -f "$BACKUP_DIR/postgres.dump" ]]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_restore -U "$PGUSER" -d "$PGDB" --clean --if-exists --no-owner \
    < "$BACKUP_DIR/postgres.dump" || echo "[restore] pg_restore warnings (often OK)"
fi
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
echo "[restore] done → curl -fsS https://${SITE_ADDRESS:-keyantong.online}/api/health"
