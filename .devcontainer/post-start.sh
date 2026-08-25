#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Best-effort: start shared deps when Docker is available in the Codespace.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker compose -f infra/docker-compose.dev.yml up -d || true
fi
