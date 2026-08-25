#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

corepack enable
corepack prepare pnpm@9.15.9 --activate

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

pnpm install --ignore-scripts

echo "KeyanTong Codespace ready. Run: pnpm dev:portal"
