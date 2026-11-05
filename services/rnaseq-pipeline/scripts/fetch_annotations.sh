#!/usr/bin/env bash
# Fetch / refresh human + mouse gene2go.tsv and gene2kegg.tsv into annotations/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPECIES="${1:-all}"
OUT="${2:-$ROOT/annotations}"
mkdir -p "$OUT"
echo "==> fetching annotations species=$SPECIES out=$OUT"
Rscript "$ROOT/scripts/fetch_annotations.R" "$SPECIES" "$OUT"
echo "==> sizes:"
du -sh "$OUT"/human "$OUT"/mouse 2>/dev/null || true
ls -lh "$OUT"/human/*.tsv "$OUT"/mouse/*.tsv 2>/dev/null || true
