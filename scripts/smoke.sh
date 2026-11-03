#!/usr/bin/env bash
# Minimal smoke checks for the KeyanTong skeleton.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> docker compose config (dev)"
docker compose -f infra/docker-compose.dev.yml config >/dev/null

echo "==> docker compose config (prod skeleton)"
docker compose -f infra/docker-compose.yml config >/dev/null

if [[ -x apps/portal/node_modules/.bin/tsc ]]; then
  echo "==> portal typecheck"
  (cd apps/portal && ./node_modules/.bin/tsc --noEmit)
else
  echo "==> skip portal typecheck (run pnpm install first)"
fi

if [[ -x apps/admin/node_modules/.bin/tsc ]]; then
  echo "==> admin typecheck"
  (cd apps/admin && ./node_modules/.bin/tsc --noEmit)
else
  echo "==> skip admin typecheck (run pnpm install first)"
fi

if command -v curl >/dev/null 2>&1; then
  for url in http://127.0.0.1:8000/health http://127.0.0.1:8001/health; do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      echo "==> health ok: $url"
    else
      echo "==> health skip (not running): $url"
    fi
  done
  for url in \
    http://127.0.0.1:3000/ \
    http://127.0.0.1:3000/papers \
    http://127.0.0.1:3000/community \
    http://127.0.0.1:3000/tools \
    http://127.0.0.1:3001/login
  do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      echo "==> page ok: $url"
    else
      echo "==> page skip (not running): $url"
    fi
  done
fi


if [[ -x services/rnaseq-pipeline/smoke.sh ]]; then
  echo "==> rnaseq-pipeline smoke"
  ./services/rnaseq-pipeline/smoke.sh
else
  echo "==> skip rnaseq-pipeline smoke"
fi

if [[ -d services/ncbi-upload/tests ]]; then
  echo "==> ncbi-upload unit tests"
  (cd services/ncbi-upload && PYTHONPATH=. python3 -m unittest tests.test_validators -q)
else
  echo "==> skip ncbi-upload tests"
fi

echo "smoke: ok"
