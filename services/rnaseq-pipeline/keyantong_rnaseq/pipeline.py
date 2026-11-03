"""End-to-end one-click RNAseq downstream pipeline."""
from __future__ import annotations

import json
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .de import run_de
from .io import load_groups, load_matrix, normalize_contrast
from .plots import plot_heatmap, plot_pca, plot_regulation_venn, plot_volcano


@dataclass
class PipelineResult:
    outdir: str
    control_label: str
    treatment_label: str
    n_genes: int
    n_samples: int
    n_up: int
    n_down: int
    artifacts: list[str]
    enrichment: str
    bundle: str


def run_pipeline(
    matrix_path: Path,
    groups_path: Path,
    outdir: Path,
    species: str = "none",
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
) -> PipelineResult:
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    plots_dir = outdir / "plots"
    tables_dir = outdir / "tables"
    plots_dir.mkdir(exist_ok=True)
    tables_dir.mkdir(exist_ok=True)

    matrix = load_matrix(Path(matrix_path))
    groups_raw = load_groups(Path(groups_path))
    # keep only overlapping samples
    overlap = [s for s in groups_raw.index if s in matrix.columns]
    if len(overlap) < 4:
        raise ValueError("矩阵与分组的共有样本不足 4 个")
    groups_raw = groups_raw.loc[overlap]
    matrix = matrix[overlap]
    control_label, treatment_label, groups = normalize_contrast(groups_raw["group"])

    # persist resolved sample sheet
    sample_sheet = pd.DataFrame(
        {
            "sample": groups.index,
            "group_input": groups_raw.loc[groups.index, "group"].values,
            "group": groups.values,
            "role": groups.map({"control": f"control({control_label})", "treatment": f"treatment({treatment_label})"}),
        }
    )
    sample_sheet_path = tables_dir / "sample_sheet_resolved.csv"
    sample_sheet.to_csv(sample_sheet_path, index=False)

    deg = run_de(matrix, groups)
    # apply cutoffs already in significant column defaults; recompute if custom
    if lfc_cutoff != 1.0 or padj_cutoff != 0.05:
        deg["significant"] = (deg["padj"] <= padj_cutoff) & (deg["log2FC"].abs() >= lfc_cutoff)
        deg["regulation"] = [
            "up" if s and fc > 0 else "down" if s and fc < 0 else "ns"
            for s, fc in zip(deg["significant"], deg["log2FC"])
        ]
    deg_path = tables_dir / "deg_all.csv"
    deg.to_csv(deg_path, index=False)
    deg_sig = deg[deg["significant"]]
    deg_sig_path = tables_dir / "deg_significant.csv"
    deg_sig.to_csv(deg_sig_path, index=False)

    artifacts: list[Path] = [sample_sheet_path, deg_path, deg_sig_path]
    artifacts += plot_pca(matrix, groups, plots_dir / "PCA")
    artifacts += plot_volcano(deg, plots_dir / "volcano")
    artifacts += plot_heatmap(matrix, groups, deg, plots_dir / "heatmap")
    artifacts += plot_regulation_venn(deg, plots_dir / "venn_up_down")

    enrich_note = tables_dir / "enrichment_status.txt"
    sp = (species or "none").strip().lower()
    if sp in {"", "none", "na", "null"}:
        enrich_note.write_text(
            "GO/KEGG 未运行：未提供可用物种注释（--species none）。\n"
            "后续版本可在提供 gene→GO/KEGG 映射或物种库时自动富集。\n",
            encoding="utf-8",
        )
        enrichment = "skipped_no_annotation"
    else:
        enrich_note.write_text(
            f"物种参数: {species}\n"
            "当前切片尚未内置该物种注释库；已记录请求，GO/KEGG 标记为 pending_annotation。\n",
            encoding="utf-8",
        )
        enrichment = "pending_annotation"
    artifacts.append(enrich_note)

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input": {"matrix": str(matrix_path), "groups": str(groups_path), "species": species},
        "contrast": {"control": control_label, "treatment": treatment_label},
        "thresholds": {"abs_log2FC": lfc_cutoff, "padj": padj_cutoff},
        "summary": {
            "n_genes": int(matrix.shape[0]),
            "n_samples": int(matrix.shape[1]),
            "n_up": int((deg["regulation"] == "up").sum()),
            "n_down": int((deg["regulation"] == "down").sum()),
            "enrichment": enrichment,
        },
        "artifacts": [str(p.relative_to(outdir)) for p in artifacts],
    }
    manifest_path = outdir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    artifacts.append(manifest_path)

    bundle_path = outdir / "rnaseq_results.zip"
    with zipfile.ZipFile(bundle_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        seen = set()
        for p in artifacts:
            arc = str(p.relative_to(outdir))
            if arc in seen:
                continue
            seen.add(arc)
            zf.write(p, arcname=arc)

    return PipelineResult(
        outdir=str(outdir),
        control_label=control_label,
        treatment_label=treatment_label,
        n_genes=int(matrix.shape[0]),
        n_samples=int(matrix.shape[1]),
        n_up=int((deg["regulation"] == "up").sum()),
        n_down=int((deg["regulation"] == "down").sum()),
        artifacts=[str(p) for p in artifacts],
        enrichment=enrichment,
        bundle=str(bundle_path),
    )


def result_to_dict(result: PipelineResult) -> dict:
    return asdict(result)
