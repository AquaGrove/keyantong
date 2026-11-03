#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="${TMPDIR:-/tmp}/keyantong-rnaseq-smoke-$$"
mkdir -p "$OUT"
export PYTHONPATH="$ROOT${PYTHONPATH:+:$PYTHONPATH}"
python3 -m keyantong_rnaseq \
  --matrix "$ROOT/fixtures/tiny_matrix.csv" \
  --groups "$ROOT/fixtures/tiny_groups.csv" \
  --outdir "$OUT" \
  --species none
need=(
  "$OUT/tables/deg_all.csv"
  "$OUT/tables/deg_significant.csv"
  "$OUT/plots/PCA.png"
  "$OUT/plots/volcano.png"
  "$OUT/plots/heatmap.png"
  "$OUT/plots/venn_up_down.png"
  "$OUT/manifest.json"
  "$OUT/rnaseq_results.zip"
)
for f in "${need[@]}"; do
  if [[ ! -s "$f" ]]; then
    echo "MISSING or empty: $f" >&2
    exit 1
  fi
done
python3 -c 'import pandas as pd,sys; df=pd.read_csv(sys.argv[1]);
assert set(["gene","log2FC","pvalue","padj","regulation"]).issubset(df.columns);
assert len(df)>=10;
up=int((df.regulation=="up").sum()); down=int((df.regulation=="down").sum());
assert up>=5 and down>=5, (up,down);
print(f"smoke ok: genes={len(df)} up={up} down={down}")' "$OUT/tables/deg_all.csv"
echo "rnaseq-pipeline smoke: ok ($OUT)"
