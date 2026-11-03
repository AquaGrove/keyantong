"""End-to-end one-click RNAseq downstream pipeline (multi-group aware)."""
from __future__ import annotations

import json
import re
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .config import AnalysisConfig, load_analysis_config
from .de import run_de_samples
from .io import load_matrix
from .plots import plot_heatmap, plot_multi_set_venn, plot_pca, plot_regulation_venn, plot_volcano


def _slug(text: str) -> str:
    s = re.sub(r"[^\w\-]+", "_", text.strip(), flags=re.UNICODE)
    return s.strip("_")[:80] or "contrast"


@dataclass
class PipelineResult:
    outdir: str
    control_label: str
    treatment_label: str
    contrasts: list[str]
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
    species: str | None = None,
    lfc_cutoff: float | None = None,
    padj_cutoff: float | None = None,
    config: AnalysisConfig | None = None,
) -> PipelineResult:
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    plots_dir = outdir / "plots"
    tables_dir = outdir / "tables"
    plots_dir.mkdir(exist_ok=True)
    tables_dir.mkdir(exist_ok=True)

    cfg = config or load_analysis_config(
        Path(groups_path),
        species=species,
        lfc=lfc_cutoff,
        padj=padj_cutoff,
    )
    if species is not None:
        cfg.species = species
    if lfc_cutoff is not None:
        cfg.lfc = lfc_cutoff
    if padj_cutoff is not None:
        cfg.padj = padj_cutoff

    matrix = load_matrix(Path(matrix_path))
    sample_map = cfg.sample_to_group()
    overlap = [s for s in sample_map if s in matrix.columns]
    if len(overlap) < 4:
        raise ValueError("矩阵与分组的共有样本不足 4 个")
    # drop samples not in matrix from groups (keep config copy)
    for g in cfg.groups:
        g.samples = [s for s in g.samples if s in matrix.columns]
    sample_map = cfg.sample_to_group()
    overlap = list(sample_map.keys())
    matrix = matrix[overlap]

    # series keyed by sample -> display name; colors by display name
    group_labels = pd.Series({s: sample_map[s].name for s in overlap})
    color_by_label = {g.name: g.color for g in cfg.groups}

    cfg.write_json(tables_dir / "analysis_config_resolved.json")
    sample_sheet = pd.DataFrame(
        [
            {
                "sample": s,
                "group": sample_map[s].name,
                "group_id": sample_map[s].id,
                "role": sample_map[s].role,
                "color": sample_map[s].color,
            }
            for s in overlap
        ]
    )
    sample_sheet_path = tables_dir / "sample_sheet_resolved.csv"
    sample_sheet.to_csv(sample_sheet_path, index=False)

    contrasts = cfg.auto_contrasts()
    id_to_group = {g.id: g for g in cfg.groups}
    artifacts: list[Path] = [sample_sheet_path, tables_dir / "analysis_config_resolved.json"]

    deg_by_contrast: dict[str, pd.DataFrame] = {}
    all_deg_frames: list[pd.DataFrame] = []
    for c in contrasts:
        treat_g = id_to_group[c["treatment"]]
        ctrl_g = id_to_group[c["control"]]
        cid = c.get("id") or f"{treat_g.name}_vs_{ctrl_g.name}"
        deg = run_de_samples(
            matrix,
            ctrl_g.samples,
            treat_g.samples,
            lfc_cutoff=cfg.lfc,
            padj_cutoff=cfg.padj,
            contrast_id=cid,
        )
        deg_by_contrast[cid] = deg
        all_deg_frames.append(deg)
        safe = _slug(cid)
        p = tables_dir / f"deg_{safe}.csv"
        deg.to_csv(p, index=False)
        artifacts.append(p)
        sig = deg[deg["significant"]]
        sp = tables_dir / f"deg_{safe}_significant.csv"
        sig.to_csv(sp, index=False)
        artifacts.append(sp)

    deg_all = pd.concat(all_deg_frames, ignore_index=True) if all_deg_frames else pd.DataFrame()
    deg_all_path = tables_dir / "deg_all.csv"
    deg_all.to_csv(deg_all_path, index=False)
    artifacts.append(deg_all_path)
    deg_sig_all = deg_all[deg_all["significant"]] if not deg_all.empty else deg_all
    deg_sig_path = tables_dir / "deg_significant.csv"
    deg_sig_all.to_csv(deg_sig_path, index=False)
    artifacts.append(deg_sig_path)

    primary_id = contrasts[0].get("id") or list(deg_by_contrast.keys())[0]
    primary_deg = deg_by_contrast[primary_id]

    if cfg.plots.pca:
        artifacts += plot_pca(matrix, group_labels, plots_dir / "PCA", color_by_label=color_by_label)
    if cfg.plots.volcano:
        for cid, deg in deg_by_contrast.items():
            artifacts += plot_volcano(
                deg,
                plots_dir / f"volcano_{_slug(cid)}",
                lfc_cutoff=cfg.lfc,
                padj_cutoff=cfg.padj,
                title=f"Volcano · {cid}",
                up_color=cfg.venn.colors.get("up", "#b91c1c"),
                down_color=cfg.venn.colors.get("down", "#1d4ed8"),
            )
        # also canonical volcano.png for primary
        artifacts += plot_volcano(
            primary_deg,
            plots_dir / "volcano",
            lfc_cutoff=cfg.lfc,
            padj_cutoff=cfg.padj,
            title=f"Volcano · {primary_id}",
            up_color=cfg.venn.colors.get("up", "#b91c1c"),
            down_color=cfg.venn.colors.get("down", "#1d4ed8"),
        )
    if cfg.plots.heatmap:
        artifacts += plot_heatmap(
            matrix,
            group_labels,
            primary_deg,
            plots_dir / "heatmap",
            color_by_label=color_by_label,
        )

    if cfg.plots.venn:
        selected = cfg.venn.contrasts
        contrast_ids = list(deg_by_contrast.keys())
        if selected:
            contrast_ids = [c for c in contrast_ids if c in selected]
        if not contrast_ids:
            contrast_ids = list(deg_by_contrast.keys())

        modes = cfg.venn.modes
        if "up_down_per_contrast" in modes:
            for cid in contrast_ids:
                artifacts += plot_regulation_venn(
                    deg_by_contrast[cid],
                    plots_dir / f"venn_up_down_{_slug(cid)}",
                    up_color=cfg.venn.colors.get("up", "#b91c1c"),
                    down_color=cfg.venn.colors.get("down", "#1d4ed8"),
                    title=f"Up vs Down · {cid}",
                )
            # canonical name for smoke / primary
            artifacts += plot_regulation_venn(
                deg_by_contrast[contrast_ids[0]],
                plots_dir / "venn_up_down",
                up_color=cfg.venn.colors.get("up", "#b91c1c"),
                down_color=cfg.venn.colors.get("down", "#1d4ed8"),
                title=f"Up vs Down · {contrast_ids[0]}",
            )

        def _sets(kind: str) -> dict[str, set[str]]:
            out: dict[str, set[str]] = {}
            for cid in contrast_ids:
                deg = deg_by_contrast[cid]
                if kind == "up":
                    genes = set(deg.loc[deg["regulation"] == "up", "gene"].astype(str))
                elif kind == "down":
                    genes = set(deg.loc[deg["regulation"] == "down", "gene"].astype(str))
                else:
                    genes = set(deg.loc[deg["significant"], "gene"].astype(str))
                # short label = treatment side of contrast id
                label = cid.split("_vs_")[0] if "_vs_" in cid else cid
                out[label] = genes
            return out

        # colors aligned to contrast / set order
        cid_to_contrast = {}
        for c in contrasts:
            cid = c.get("id") or f"{id_to_group[c['treatment']].name}_vs_{id_to_group[c['control']].name}"
            cid_to_contrast[cid] = c
        set_colors: list[str] = [
            id_to_group[cid_to_contrast[cid]["treatment"]].color for cid in contrast_ids
        ]

        if "multi_group_up" in modes and len(contrast_ids) >= 1:
            artifacts += plot_multi_set_venn(
                _sets("up"),
                plots_dir / "venn_multi_up",
                colors=set_colors,
                title="Multi-group Venn · Up",
            )
        if "multi_group_down" in modes and len(contrast_ids) >= 1:
            artifacts += plot_multi_set_venn(
                _sets("down"),
                plots_dir / "venn_multi_down",
                colors=set_colors,
                title="Multi-group Venn · Down",
            )
        if "multi_group_deg" in modes and len(contrast_ids) >= 1:
            artifacts += plot_multi_set_venn(
                _sets("deg"),
                plots_dir / "venn_multi_deg",
                colors=set_colors,
                title="Multi-group Venn · Significant (up∪down)",
            )

    enrich_note = tables_dir / "enrichment_status.txt"
    sp = (cfg.species or "none").strip().lower()
    if sp in {"", "none", "na", "null"}:
        enrich_note.write_text(
            "GO/KEGG 未运行：未提供可用物种注释（--species none）。\n"
            "后续版本可在提供 gene→GO/KEGG 映射或物种库时自动富集。\n",
            encoding="utf-8",
        )
        enrichment = "skipped_no_annotation"
    else:
        enrich_note.write_text(
            f"物种参数: {cfg.species}\n"
            "当前切片尚未内置该物种注释库；已记录请求，GO/KEGG 标记为 pending_annotation。\n",
            encoding="utf-8",
        )
        enrichment = "pending_annotation"
    artifacts.append(enrich_note)

    n_up = int((primary_deg["regulation"] == "up").sum()) if not primary_deg.empty else 0
    n_down = int((primary_deg["regulation"] == "down").sum()) if not primary_deg.empty else 0
    ctrl = cfg.primary_control()
    treat_names = [id_to_group[c["treatment"]].name for c in contrasts]

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "input": {"matrix": str(matrix_path), "groups": str(groups_path), "species": cfg.species},
        "groups": [g.to_dict() for g in cfg.groups],
        "contrast": {"control": ctrl.name, "treatments": treat_names, "list": contrasts},
        "thresholds": {"abs_log2FC": cfg.lfc, "padj": cfg.padj},
        "venn": {"modes": cfg.venn.modes, "contrasts": cfg.venn.contrasts, "colors": cfg.venn.colors},
        "summary": {
            "n_genes": int(matrix.shape[0]),
            "n_samples": int(matrix.shape[1]),
            "n_up": n_up,
            "n_down": n_down,
            "n_contrasts": len(contrasts),
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
        control_label=ctrl.name,
        treatment_label=",".join(treat_names),
        contrasts=[c.get("id") or f"{id_to_group[c['treatment']].name}_vs_{id_to_group[c['control']].name}" for c in contrasts],
        n_genes=int(matrix.shape[0]),
        n_samples=int(matrix.shape[1]),
        n_up=n_up,
        n_down=n_down,
        artifacts=[str(p) for p in artifacts],
        enrichment=enrichment,
        bundle=str(bundle_path),
    )


def result_to_dict(result: PipelineResult) -> dict:
    return asdict(result)
