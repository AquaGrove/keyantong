#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${TMPDIR:-/tmp}/keyantong-rnaseq-smoke-$$"
mkdir -p "$OUT"
export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"

echo "==> legacy 2-group CSV"
OUT1="$OUT/legacy"
mkdir -p "$OUT1"
python3 -m keyantong_rnaseq \
  --matrix "$ROOT/fixtures/tiny_matrix.csv" \
  --groups "$ROOT/fixtures/tiny_groups.csv" \
  --outdir "$OUT1" \
  --species none

echo "==> multi-group JSON + limma_like + demo enrichment + SVG"
OUT2="$OUT/multi"
mkdir -p "$OUT2"
python3 -m keyantong_rnaseq \
  --matrix "$ROOT/fixtures/tiny_matrix.csv" \
  --groups "$ROOT/fixtures/tiny_analysis.json" \
  --outdir "$OUT2"

echo "==> one selected contrast only"
OUT3="$OUT/one"
mkdir -p "$OUT3"
python3 -m keyantong_rnaseq \
  --matrix "$ROOT/fixtures/tiny_matrix.csv" \
  --groups "$ROOT/fixtures/tiny_analysis_one_contrast.json" \
  --outdir "$OUT3" \
  --species none

need=(
  "$OUT2/tables/deg_all.csv"
  "$OUT2/tables/deg_significant.csv"
  "$OUT2/tables/analysis_config_resolved.json"
  "$OUT2/tables/methods.json"
  "$OUT2/tables/go_enrichment.csv"
  "$OUT2/plots/PCA.png"
  "$OUT2/plots/PCA.svg"
  "$OUT2/plots/volcano.png"
  "$OUT2/plots/heatmap.png"
  "$OUT2/plots/venn_up_down.png"
  "$OUT2/plots/venn_multi_up.png"
  "$OUT2/plots/venn_multi_up_regions.csv"
  "$OUT2/plots/venn_multi_down.png"
  "$OUT2/plots/venn_multi_deg.png"
  "$OUT2/manifest.json"
  "$OUT2/rnaseq_results.zip"
  "$OUT3/tables/deg_all.csv"
)
for f in "${need[@]}"; do
  if [[ ! -s "$f" ]]; then
    echo "MISSING or empty: $f" >&2
    exit 1
  fi
done

python3 - <<'PY' "$OUT2" "$OUT3"
import json, sys
from pathlib import Path
import pandas as pd
out = Path(sys.argv[1])
one = Path(sys.argv[2])
df = pd.read_csv(out / "tables/deg_all.csv")
assert "contrast" in df.columns
assert set(["gene","log2FC","pvalue","padj","regulation"]).issubset(df.columns)
assert "engine" in df.columns
assert (df["engine"] == "limma_like").all() or set(df["engine"]).issubset({"limma_like","welch","pydeseq2"})
contrasts = sorted(df.contrast.unique())
assert len(contrasts) >= 2, contrasts
manifest = json.loads((out / "manifest.json").read_text())
assert manifest["summary"]["n_contrasts"] >= 2
assert manifest["summary"].get("de_engine")
methods = json.loads((out / "tables/methods.json").read_text())
assert methods["de_engine_used"]
assert (out / "plots/venn_multi_up_regions.csv").exists()
enrich = json.loads((out / "tables/enrichment_meta.json").read_text())
assert enrich["status"] in ("ok", "ok_empty"), enrich
# one-contrast fixture
df1 = pd.read_csv(one / "tables/deg_all.csv")
assert df1["contrast"].nunique() == 1, df1["contrast"].unique()
print(f"smoke ok: contrasts={contrasts} engine={methods['de_engine_used']} enrich={enrich['status']} one={df1['contrast'].unique().tolist()}")
PY

echo "rnaseq-pipeline smoke: ok ($OUT)"
