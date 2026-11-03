#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${TMPDIR:-/tmp}/keyantong-rnaseq-smoke-$$"
mkdir -p "$OUT"

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHON="$ROOT/.venv/bin/python"
elif command -v python3.11 >/dev/null 2>&1; then
  PYTHON="$(command -v python3.11)"
else
  PYTHON="$(command -v python3)"
fi
export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"
echo "==> using PYTHON=$PYTHON"

echo "==> engine probe"
"$PYTHON" - <<'PY'
from keyantong_rnaseq.de import available_engines, engine_catalog
import json
eng = available_engines()
probe = engine_catalog()["probe"]
print("available_engines:", eng)
print(json.dumps(probe.get("packages", {}), indent=2))
assert "limma_like" in eng and "welch" in eng
print("pydeseq2_present:", "pydeseq2" in eng)
PY

echo "==> legacy 2-group CSV"
OUT1="$OUT/legacy"
mkdir -p "$OUT1"
"$PYTHON" -m keyantong_rnaseq \
  --matrix "$ROOT/fixtures/tiny_matrix.csv" \
  --groups "$ROOT/fixtures/tiny_groups.csv" \
  --outdir "$OUT1" \
  --species none

echo "==> multi-group JSON + limma_like + demo enrichment + SVG"
OUT2="$OUT/multi"
mkdir -p "$OUT2"
"$PYTHON" -m keyantong_rnaseq \
  --matrix "$ROOT/fixtures/tiny_matrix.csv" \
  --groups "$ROOT/fixtures/tiny_analysis.json" \
  --outdir "$OUT2"

echo "==> one selected contrast only"
OUT3="$OUT/one"
mkdir -p "$OUT3"
"$PYTHON" -m keyantong_rnaseq \
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
  "$OUT2/tables/kegg_enrichment.csv"
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

"$PYTHON" - <<'PY' "$OUT2" "$OUT3"
import json, sys
from pathlib import Path
import pandas as pd
out = Path(sys.argv[1])
one = Path(sys.argv[2])
df = pd.read_csv(out / "tables/deg_all.csv")
assert "contrast" in df.columns
assert set(["gene","log2FC","pvalue","padj","regulation"]).issubset(df.columns)
assert "engine" in df.columns
assert set(df["engine"]).issubset({"r_limma","r_edger","r_deseq2","limma_like","welch","pydeseq2"}), set(df["engine"])
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
df1 = pd.read_csv(one / "tables/deg_all.csv")
assert df1["contrast"].nunique() == 1, df1["contrast"].unique()
avail = methods.get("available_engines") or []
used = methods["de_engine_used"]
if "r_limma" in avail:
    assert used == "r_limma", (used, avail)
else:
    assert used in ("limma_like", "welch"), used
assert (out / "tables/kegg_enrichment.csv").exists()
print(f"smoke ok: contrasts={contrasts} engine={used} enrich={enrich['status']} kegg=yes one={df1['contrast'].unique().tolist()}")
PY

echo "rnaseq-pipeline smoke: ok ($OUT)"
