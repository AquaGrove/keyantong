"""Detect R + Bioconductor DE engines and run them via Rscript."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

_ENGINE_TO_FLAG = {
    "r_limma": "limma",
    "limma": "limma",
    "r_edger": "edger",
    "edger": "edger",
    "edgeR": "edger",
    "r_deseq2": "deseq2",
    "deseq2": "deseq2",
    "DESeq2": "deseq2",
}
_PKG_FOR = {"limma": "limma", "edger": "edgeR", "deseq2": "DESeq2"}


def rscript_bin() -> str | None:
    explicit = os.environ.get("RSCRIPT_BIN") or os.environ.get("R_SCRIPT")
    if explicit and Path(explicit).exists():
        return explicit
    return shutil.which("Rscript")


def r_script_path() -> Path:
    return Path(__file__).resolve().parent.parent / "r" / "run_de.R"


@lru_cache(maxsize=1)
def detect_r_packages() -> dict[str, Any]:
    rs = rscript_bin()
    out: dict[str, Any] = {"R": False, "limma": False, "edgeR": False, "DESeq2": False, "rscript": rs}
    if not rs:
        return out
    out["R"] = True
    code = (
        'cat(paste('
        'paste0("limma=", requireNamespace("limma", quietly=TRUE)),'
        'paste0("edgeR=", requireNamespace("edgeR", quietly=TRUE)),'
        'paste0("DESeq2=", requireNamespace("DESeq2", quietly=TRUE)),'
        'sep="\\n"))'
    )
    try:
        proc = subprocess.run([rs, "-e", code], capture_output=True, text=True, timeout=60, check=False)
        text = (proc.stdout or "") + "\n" + (proc.stderr or "")
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("limma="):
                out["limma"] = line.endswith("TRUE")
            elif line.startswith("edgeR="):
                out["edgeR"] = line.endswith("TRUE")
            elif line.startswith("DESeq2="):
                out["DESeq2"] = line.endswith("TRUE")
    except Exception:
        pass
    return out


def available_r_engines() -> list[str]:
    info = detect_r_packages()
    engines: list[str] = []
    if info.get("limma"):
        engines.append("r_limma")
    if info.get("edgeR"):
        engines.append("r_edger")
    if info.get("DESeq2"):
        engines.append("r_deseq2")
    return engines


def engine_probe_report() -> dict[str, Any]:
    info = detect_r_packages()
    pydeseq2 = False
    try:
        import pydeseq2  # noqa: F401
        pydeseq2 = True
    except Exception:
        pydeseq2 = False
    return {
        "rscript": info.get("rscript"),
        "R": bool(info.get("R")),
        "packages": {
            "limma": bool(info.get("limma")),
            "edgeR": bool(info.get("edgeR")),
            "DESeq2": bool(info.get("DESeq2")),
            "pydeseq2": pydeseq2,
        },
        "engines": {
            "python": ["limma_like", "welch"] + (["pydeseq2"] if pydeseq2 else []),
            "r": available_r_engines(),
        },
        "install_hints": {
            "r_limma": 'BiocManager::install("limma")',
            "r_edger": 'BiocManager::install("edgeR")',
            "r_deseq2": 'BiocManager::install("DESeq2")',
            "pydeseq2": "pip install 'pydeseq2>=0.4'",
        },
    }


def run_de_r(
    matrix: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
    *,
    engine: str = "r_limma",
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
    min_count: float = 0.0,
    contrast_id: str = "",
) -> pd.DataFrame:
    rs = rscript_bin()
    if not rs:
        raise RuntimeError("未找到 Rscript；请安装 R 或设置 RSCRIPT_BIN")
    flag = _ENGINE_TO_FLAG.get(engine, engine)
    pkg = _PKG_FOR.get(flag)
    info = detect_r_packages()
    if pkg and not info.get(pkg):
        raise RuntimeError(f"R 包 {pkg} 未安装")
    script = r_script_path()
    if not script.is_file():
        raise RuntimeError(f"缺少 R 脚本: {script}")
    missing = [s for s in control_samples + treatment_samples if s not in matrix.columns]
    if missing:
        raise ValueError(f"分组样本不在矩阵中: {missing}")
    if len(control_samples) < 2 or len(treatment_samples) < 2:
        raise ValueError("对照与实验组各自至少需要 2 个样本")
    X = matrix[control_samples + treatment_samples].astype(float)
    if flag in ("edger", "deseq2"):
        import numpy as np
        values = X.to_numpy()
        if not np.isfinite(values).all() or (values < 0).any() or not np.equal(values,np.floor(values)).all():
            raise ValueError("DESeq2/edgeR 要求非负整数原始 counts，不能输入 TPM/FPKM 或小数矩阵")
    keep = (X.sum(axis=1) > min_count) & (X.var(axis=1) > 0)
    X = X.loc[keep]
    with tempfile.TemporaryDirectory(prefix="kt-rde-") as tmp:
        tmp_path = Path(tmp)
        mat_path = tmp_path / "matrix.csv"
        meta_path = tmp_path / "meta.csv"
        outdir = tmp_path / "out"
        outdir.mkdir()
        X.to_csv(mat_path, index_label="gene_id")
        meta = pd.DataFrame(
            {
                "sample": control_samples + treatment_samples,
                "group": ["control"] * len(control_samples) + ["treatment"] * len(treatment_samples),
            }
        )
        meta.to_csv(meta_path, index=False)
        cmd = [
            rs, str(script), "--engine", flag, "--matrix", str(mat_path), "--meta", str(meta_path),
            "--outdir", str(outdir), "--lfc", str(lfc_cutoff), "--padj", str(padj_cutoff),
            "--contrast_id", contrast_id or "",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600, check=False)
        result_csv = outdir / "de_result.csv"
        if proc.returncode != 0 or not result_csv.is_file():
            err = (proc.stderr or proc.stdout or "R DE failed").strip()
            raise RuntimeError(err[-2000:])
        df = pd.read_csv(result_csv)
        needed = ["gene", "log2FC", "pvalue", "padj", "engine"]
        for col in needed:
            if col not in df.columns:
                raise RuntimeError(f"R 输出缺少列 {col}")
        if "mean_control" not in df.columns:
            df["mean_control"] = 0.0
        if "mean_treatment" not in df.columns:
            df["mean_treatment"] = 0.0
        if "significant" not in df.columns:
            df["significant"] = (df["padj"] <= padj_cutoff) & (df["log2FC"].abs() >= lfc_cutoff)
        if "regulation" not in df.columns:
            df["regulation"] = "ns"
            df.loc[df["significant"] & (df["log2FC"] > 0), "regulation"] = "up"
            df.loc[df["significant"] & (df["log2FC"] < 0), "regulation"] = "down"
        if contrast_id and "contrast" not in df.columns:
            df.insert(0, "contrast", contrast_id)
        elif contrast_id:
            df["contrast"] = contrast_id
        return df.sort_values(["padj", "pvalue"]).reset_index(drop=True)
