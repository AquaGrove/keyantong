"""CLI entry: matrix + groups/config -> automated downstream bundle."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .pipeline import result_to_dict, run_pipeline


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="keyantong-rnaseq",
        description="科研通：表达矩阵 + 多组分组/配置 → 自动 DE + PCA/火山图/热图/灵活维恩",
    )
    p.add_argument("--matrix", required=True, type=Path, help="表达矩阵 CSV/TSV（首列为 gene_id）")
    p.add_argument(
        "--groups",
        required=True,
        type=Path,
        help="分组表 CSV/TSV（sample,group）或 analysis JSON（含 groups/colors/venn）",
    )
    p.add_argument("--outdir", required=True, type=Path, help="输出目录")
    p.add_argument("--species", default=None, help="物种（无可注解时填 none；默认读配置或 none）")
    p.add_argument("--lfc", type=float, default=None, help="|log2FC| 阈值（覆盖配置）")
    p.add_argument("--padj", type=float, default=None, help="padj 阈值（覆盖配置）")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = run_pipeline(
            matrix_path=args.matrix,
            groups_path=args.groups,
            outdir=args.outdir,
            species=args.species,
            lfc_cutoff=args.lfc,
            padj_cutoff=args.padj,
        )
    except Exception as exc:  # noqa: BLE001 - CLI surface
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result_to_dict(result), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
