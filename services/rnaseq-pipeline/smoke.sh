#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${TMPDIR:-/tmp}/keyantong-rnaseq-smoke-$$"
mkdir -p "$OUT"
export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"

echo "==> legacy 2-group CSV"
OUT1="$OUT/legacy"
mkdir -p "$OUT1"
# rebuild a tiny 2-group matrix view from multi fixture via groups csv that only uses C+A
python3 -m keyantong_rnaseq \
  --matrix "$ROOT/fixtures/tiny_matrix.csv" \
  --groups "$ROOT/fixtures/tiny_groups.csv" \
  --outdir "$OUT1" \
  --species none

echo "==> multi-group JSON config + flexible Venn"
OUT2="$OUT/multi"
mkdir -p "$OUT2"
python3 -m keyantong_rnaseq \
  --matrix "$ROOT/fixtures/tiny_matrix.csv" \
  --groups "$ROOT/fixtures/tiny_analysis.json" \
  --outdir "$OUT2" \
  --species none

need=(
  "$OUT2/tables/deg_all.csv"
  "$OUT2/tables/deg_significant.csv"
  "$OUT2/tables/analysis_config_resolved.json"
  "$OUT2/plots/PCA.png"
  "$OUT2/plots/volcano.png"
  "$OUT2/plots/heatmap.png"
  "$OUT2/plots/venn_up_down.png"
  "$OUT2/plots/venn_multi_up.png"
  "$OUT2/plots/venn_multi_down.png"
  "$OUT2/plots/venn_multi_deg.png"
  "$OUT2/manifest.json"
  "$OUT2/rnaseq_results.zip"
)
for f in "${need[@]}"; do
  if [[ ! -s "$f" ]]; then
    echo "MISSING or empty: $f" >&2
    exit 1
  fi
done

python3 - <<'PY' "$OUT2"
import json, sys
from pathlib import Path
import pandas as pd
out = Path(sys.argv[1])
df = pd.read_csv(out / "tables/deg_all.csv")
assert "contrast" in df.columns
assert set(["gene","log2FC","pvalue","padj","regulation"]).issubset(df.columns)
contrasts = sorted(df.contrast.unique())
assert len(contrasts) >= 2, contrasts
manifest = json.loads((out / "manifest.json").read_text())
assert manifest["summary"]["n_contrasts"] >= 2
assert len(manifest["groups"]) >= 3
# multi membership exists
assert (out / "plots/venn_multi_up_presence.csv").exists()
print(f"smoke ok: contrasts={contrasts} genes_rows={len(df)} groups={len(manifest['groups'])}")
PY

echo "rnaseq-pipeline smoke: ok ($OUT)"
