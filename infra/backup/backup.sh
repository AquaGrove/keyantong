#!/usr/bin/env bash
# Backup KeyanTong production data for migration / disaster recovery.
set -euo pipefail
ROOT="${KEYANTONG_DATA_ROOT:-/data/keyantong}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/keyantong/infra/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/keyantong/infra/.env}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${1:-$ROOT/backups/$STAMP}"
mkdir -p "$OUT_DIR"
echo "[backup] data root: $ROOT"
echo "[backup] output: $OUT_DIR"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi
PGUSER="${POSTGRES_USER:-kt}"
PGDB="${POSTGRES_DB:-keyantong}"
if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps postgres --status running >/dev/null 2>&1; then
  echo "[backup] pg_dump…"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
    pg_dump -U "$PGUSER" -d "$PGDB" --no-owner --format=custom \
    > "$OUT_DIR/postgres.dump"
else
  echo "[backup] WARN: postgres not running; skipping pg_dump"
fi
echo "[backup] packing portal + redis + caddy + rnaseq + harness (excl backups)…"
INCLUDE=()
for d in portal redis caddy rnaseq harness; do
  [[ -e "$ROOT/$d" ]] && INCLUDE+=("$d")
done
if ((${#INCLUDE[@]})); then
  TAR=(tar)
  if [[ ! -r "$ROOT/caddy/data" || ! -r "$ROOT/caddy/config" ]]; then
    TAR=(sudo tar)
  fi
  "${TAR[@]}" -C "$ROOT" --exclude='backups' --exclude='rnaseq/incoming'     -czf "$OUT_DIR/data-volumes.tgz" "${INCLUDE[@]}" || {
      echo "[backup] WARN: volume tar had errors; retry without caddy…"
      INC2=()
      for d in "${INCLUDE[@]}"; do [[ "$d" != caddy ]] && INC2+=("$d"); done
      tar -C "$ROOT" --exclude='backups' --exclude='rnaseq/incoming'         -czf "$OUT_DIR/data-volumes.tgz" "${INC2[@]}"
      if [[ -d "$ROOT/caddy" ]]; then
        sudo tar -C "$ROOT" -czf "$OUT_DIR/caddy.tgz" caddy || true
      fi
    }
  if [[ -f "$OUT_DIR/data-volumes.tgz" ]] && command -v sudo >/dev/null; then
    sudo chown "$(id -u):$(id -g)" "$OUT_DIR/data-volumes.tgz" "$OUT_DIR/caddy.tgz" 2>/dev/null || true
  fi
fi
if [[ -f "$ENV_FILE" ]]; then
  cp -a "$ENV_FILE" "$OUT_DIR/dotenv.encopy"
  chmod 600 "$OUT_DIR/dotenv.encopy"
fi
{
  echo "stamp=$STAMP"
  echo "host=$(hostname)"
  echo "data_root=$ROOT"
  echo "created_at=$(date -Iseconds)"
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps || true
} > "$OUT_DIR/MANIFEST.txt"
echo "[backup] done: $OUT_DIR"
ls -lah "$OUT_DIR"
