"""Differential expression engines: R limma/edgeR/DESeq2 when present, limma-like EB, optional pydeseq2, Welch."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


def benjamini_hochberg(pvals: np.ndarray) -> np.ndarray:
    p = np.asarray(pvals, dtype=float)
    n = p.size
    if n == 0:
        return p
    order = np.argsort(p)
    ranked = p[order]
    adj = np.empty(n, dtype=float)
    prev = 1.0
    for i in range(n - 1, -1, -1):
        rank = i + 1
        val = ranked[i] * n / rank
        prev = min(prev, val)
        adj[order[i]] = prev
    return np.clip(adj, 0, 1)


def _finish_table(
    genes: np.ndarray,
    log2fc: np.ndarray,
    mean_c: np.ndarray,
    mean_t: np.ndarray,
    pvals: np.ndarray,
    *,
    lfc_cutoff: float,
    padj_cutoff: float,
    contrast_id: str,
    engine: str,
    extra: dict[str, np.ndarray] | None = None,
) -> pd.DataFrame:
    padj = benjamini_hochberg(pvals)
    data: dict[str, Any] = {
        "gene": genes.astype(str),
        "log2FC": log2fc,
        "mean_control": mean_c,
        "mean_treatment": mean_t,
        "pvalue": pvals,
        "padj": padj,
        "engine": engine,
    }
    if extra:
        data.update(extra)
    out = pd.DataFrame(data)
    if contrast_id:
        out.insert(0, "contrast", contrast_id)
    out["significant"] = (out["padj"] <= padj_cutoff) & (out["log2FC"].abs() >= lfc_cutoff)
    out["regulation"] = np.where(
        out["significant"] & (out["log2FC"] > 0),
        "up",
        np.where(out["significant"] & (out["log2FC"] < 0), "down", "ns"),
    )
    return out.sort_values(["padj", "pvalue"]).reset_index(drop=True)


def _prepare_matrix(
    matrix: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
    min_count: float,
) -> pd.DataFrame:
    missing = [s for s in control_samples + treatment_samples if s not in matrix.columns]
    if missing:
        raise ValueError(f"分组样本不在矩阵中: {missing}")
    if len(control_samples) < 2 or len(treatment_samples) < 2:
        raise ValueError("对照与实验组各自至少需要 2 个样本")
    X = matrix[control_samples + treatment_samples].astype(float)
    keep = (X.sum(axis=1) > min_count) & (X.var(axis=1) > 0)
    return X.loc[keep]


def run_de_welch(
    matrix: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
    *,
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
    min_count: float = 0.0,
    contrast_id: str = "",
) -> pd.DataFrame:
    X = _prepare_matrix(matrix, control_samples, treatment_samples, min_count)
    logX = np.log2(X + 1.0)
    ctrl_vals = logX[control_samples].to_numpy()
    treat_vals = logX[treatment_samples].to_numpy()
    mean_c = ctrl_vals.mean(axis=1)
    mean_t = treat_vals.mean(axis=1)
    log2fc = mean_t - mean_c
    pvals = np.empty(logX.shape[0], dtype=float)
    for i in range(logX.shape[0]):
        a = treat_vals[i]
        b = ctrl_vals[i]
        if np.allclose(a, a[0]) and np.allclose(b, b[0]) and np.isclose(a[0], b[0]):
            pvals[i] = 1.0
            continue
        try:
            _, p = stats.ttest_ind(a, b, equal_var=False, nan_policy="omit")
            pvals[i] = 1.0 if np.isnan(p) else float(p)
        except Exception:
            pvals[i] = 1.0
    return _finish_table(
        logX.index.to_numpy(),
        log2fc,
        mean_c,
        mean_t,
        pvals,
        lfc_cutoff=lfc_cutoff,
        padj_cutoff=padj_cutoff,
        contrast_id=contrast_id,
        engine="welch",
    )


def run_de_limma_like(
    matrix: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
    *,
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
    min_count: float = 0.0,
    contrast_id: str = "",
    robust: bool = True,
) -> pd.DataFrame:
    """Two-group limma-style moderated t (empirical Bayes variance squeeze).

    Operates on log2(x+1). Not identical to Bioconductor limma, but closer than
    per-gene Welch for small-n RNAseq matrices.
    """
    X = _prepare_matrix(matrix, control_samples, treatment_samples, min_count)
    logX = np.log2(X + 1.0)
    n1 = len(control_samples)
    n2 = len(treatment_samples)
    ctrl = logX[control_samples].to_numpy()
    treat = logX[treatment_samples].to_numpy()
    mean_c = ctrl.mean(axis=1)
    mean_t = treat.mean(axis=1)
    log2fc = mean_t - mean_c
    # residual SS within groups
    ss1 = ((ctrl - mean_c[:, None]) ** 2).sum(axis=1)
    ss2 = ((treat - mean_t[:, None]) ** 2).sum(axis=1)
    df = max(n1 + n2 - 2, 1)
    s2 = (ss1 + ss2) / df
    s2 = np.maximum(s2, 1e-12)

    # squeeze variances: estimate prior from log-variances
    log_s2 = np.log(s2)
    if robust:
        loc = float(np.median(log_s2))
        # MAD-based scale; convert to sd of log-var
        mad = float(np.median(np.abs(log_s2 - loc))) * 1.4826
        mad = max(mad, 1e-6)
        # approximate d0 from var(log s2) ≈ trigamma(d0/2)
        # use simple moment match on variance of s2
    # Smyth-like: s2_prior = exp(mean(log s2)), d0 from var
    s2_prior = float(np.exp(np.mean(log_s2)))
    var_log = float(np.var(log_s2, ddof=1)) if len(log_s2) > 1 else 1.0
    # trigamma(d0/2) ≈ var(log s2); crude inversion
    # for large d0, trigamma(x)≈1/x; so d0/2 ≈ 1/var_log => d0 ≈ 2/var_log
    d0 = max(2.0 / max(var_log, 1e-6), 1.0)
    d0 = float(np.clip(d0, 1.0, 1e6))
    s2_post = (d0 * s2_prior + df * s2) / (d0 + df)
    se = np.sqrt(s2_post * (1.0 / n1 + 1.0 / n2))
    tstat = log2fc / np.maximum(se, 1e-12)
    df_total = d0 + df
    pvals = 2 * stats.t.sf(np.abs(tstat), df_total)
    pvals = np.clip(pvals, 0, 1)
    return _finish_table(
        logX.index.to_numpy(),
        log2fc,
        mean_c,
        mean_t,
        pvals,
        lfc_cutoff=lfc_cutoff,
        padj_cutoff=padj_cutoff,
        contrast_id=contrast_id,
        engine="limma_like",
        extra={"t": tstat, "s2_post": s2_post},
    )


def run_de_pydeseq2(
    matrix: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
    *,
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
    min_count: float = 0.0,
    contrast_id: str = "",
) -> pd.DataFrame:
    """Optional pydeseq2 path for count-like matrices. Raises if unavailable/unsuitable."""
    from pydeseq2.dds import DeseqDataSet  # type: ignore
    from pydeseq2.ds import DeseqStats  # type: ignore

    X = _prepare_matrix(matrix, control_samples, treatment_samples, min_count)
    # pydeseq2 expects non-negative integer counts; reject clearly continuous TPM-like
    if (X < 0).any().any():
        raise ValueError("pydeseq2 requires non-negative counts")
    # heuristic: if median is small float-ish and many non-integers, skip
    vals = X.to_numpy().ravel()
    frac_int = np.mean(np.isclose(vals, np.round(vals), atol=1e-6))
    if frac_int < 0.85 and float(np.median(vals)) < 50:
        raise ValueError("matrix looks continuous (TPM/FPKM); pydeseq2 skipped")

    counts = np.rint(np.maximum(X.T.to_numpy(), 0)).astype(int)
    counts_df = pd.DataFrame(counts, index=control_samples + treatment_samples, columns=X.index.astype(str))
    meta = pd.DataFrame(
        {
            "condition": ["control"] * len(control_samples) + ["treatment"] * len(treatment_samples),
        },
        index=counts_df.index,
    )
    dds = DeseqDataSet(counts=counts_df, metadata=meta, design_factors="condition", refit_cooks=True, quiet=True)
    dds.deseq2()
    stat = DeseqStats(dds, contrast=["condition", "treatment", "control"], quiet=True)
    stat.summary()
    res = stat.results_df.copy()
    res = res.rename(columns={"log2FoldChange": "log2FC", "pvalue": "pvalue", "padj": "padj"})
    res["gene"] = res.index.astype(str)
    # approximate means on log2(count+1)
    logX = np.log2(X + 1.0)
    res["mean_control"] = logX[control_samples].mean(axis=1).reindex(res["gene"]).to_numpy()
    res["mean_treatment"] = logX[treatment_samples].mean(axis=1).reindex(res["gene"]).to_numpy()
    pvals = res["pvalue"].fillna(1.0).to_numpy(dtype=float)
    # prefer package padj but recompute BH if needed
    if res["padj"].isna().all():
        padj = benjamini_hochberg(pvals)
    else:
        padj = res["padj"].fillna(1.0).to_numpy(dtype=float)
    out = pd.DataFrame(
        {
            "gene": res["gene"].to_numpy(),
            "log2FC": res["log2FC"].fillna(0).to_numpy(dtype=float),
            "mean_control": res["mean_control"],
            "mean_treatment": res["mean_treatment"],
            "pvalue": pvals,
            "padj": padj,
            "engine": "pydeseq2",
        }
    )
    if contrast_id:
        out.insert(0, "contrast", contrast_id)
    out["significant"] = (out["padj"] <= padj_cutoff) & (out["log2FC"].abs() >= lfc_cutoff)
    out["regulation"] = np.where(
        out["significant"] & (out["log2FC"] > 0),
        "up",
        np.where(out["significant"] & (out["log2FC"] < 0), "down", "ns"),
    )
    return out.sort_values(["padj", "pvalue"]).reset_index(drop=True)


def available_engines() -> list[str]:
    """Prefer R Bioconductor when present, then Python engines."""
    out: list[str] = []
    try:
        from .r_backends import available_r_engines

        out.extend(available_r_engines())
    except Exception:
        pass
    try:
        import pydeseq2  # noqa: F401

        out.append("pydeseq2")
    except Exception:
        pass
    out.extend(["limma_like", "welch"])
    # stable unique order
    seen: set[str] = set()
    uniq: list[str] = []
    for e in out:
        if e not in seen:
            seen.add(e)
            uniq.append(e)
    return uniq


def engine_catalog() -> dict:
    """Human-facing catalog for UI / methods.json."""
    try:
        from .r_backends import engine_probe_report

        probe = engine_probe_report()
    except Exception as exc:  # noqa: BLE001
        probe = {"error": str(exc), "engines": {"python": ["limma_like", "welch"], "r": []}}
    return {
        "available": available_engines(),
        "probe": probe,
        "labels": {
            "auto": "自动：优先本机 R limma → limma_like → Welch",
            "r_limma": "Bioconductor limma（Rscript）",
            "r_edger": "Bioconductor edgeR（Rscript；需 counts）",
            "r_deseq2": "Bioconductor DESeq2（Rscript；需 counts）",
            "limma_like": "Python 经验贝叶斯 moderated t（非 Bioconductor）",
            "welch": "Welch t-test（备选）",
            "pydeseq2": "pydeseq2（可选 pip 安装；需 counts）",
        },
        "pydeseq2_install": "pip install 'pydeseq2>=0.4'",
    }


def run_de_samples(
    matrix: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
    *,
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
    min_count: float = 0.0,
    contrast_id: str = "",
    engine: str = "auto",
) -> pd.DataFrame:
    """matrix: genes x samples.

    engine: auto|r_limma|r_edger|r_deseq2|limma_like|welch|pydeseq2
    """
    eng = (engine or "auto").strip().lower()
    errors: list[str] = []
    order: list[str]
    r_avail: list[str] = []
    try:
        from .r_backends import available_r_engines

        r_avail = available_r_engines()
    except Exception:
        r_avail = []

    if eng == "auto":
        # Prefer real limma when R has it; else Python limma_like
        order = []
        if "r_limma" in r_avail:
            order.append("r_limma")
        order.extend(["limma_like", "welch"])
    elif eng in ("r_limma", "limma_bioc", "bioc_limma"):
        order = ["r_limma", "limma_like", "welch"]
    elif eng in ("r_edger", "edger", "edger"):
        order = ["r_edger", "limma_like", "welch"]
    elif eng in ("r_deseq2", "deseq2"):
        order = ["r_deseq2", "pydeseq2", "limma_like", "welch"]
    elif eng in ("limma", "limma_like", "eb", "empirical_bayes"):
        order = ["limma_like", "welch"]
    elif eng in ("welch", "ttest"):
        order = ["welch"]
    elif eng == "pydeseq2":
        order = ["pydeseq2", "limma_like", "welch"]
    else:
        order = ["limma_like", "welch"]
        errors.append(f"unknown engine {engine}, falling back")

    def _run_r(name: str) -> pd.DataFrame:
        from .r_backends import run_de_r

        return run_de_r(
            matrix,
            control_samples,
            treatment_samples,
            engine=name,
            lfc_cutoff=lfc_cutoff,
            padj_cutoff=padj_cutoff,
            min_count=min_count,
            contrast_id=contrast_id,
        )

    runners = {
        "welch": run_de_welch,
        "limma_like": run_de_limma_like,
        "pydeseq2": run_de_pydeseq2,
        "r_limma": lambda *a, **k: _run_r("r_limma"),
        "r_edger": lambda *a, **k: _run_r("r_edger"),
        "r_deseq2": lambda *a, **k: _run_r("r_deseq2"),
    }
    last_exc: Exception | None = None
    for name in order:
        try:
            if name in ("r_limma", "r_edger", "r_deseq2"):
                return _run_r(name)
            return runners[name](
                matrix,
                control_samples,
                treatment_samples,
                lfc_cutoff=lfc_cutoff,
                padj_cutoff=padj_cutoff,
                min_count=min_count,
                contrast_id=contrast_id,
            )
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            errors.append(f"{name}: {exc}")
            continue
    raise RuntimeError("所有 DE 引擎均失败: " + "; ".join(errors)) from last_exc


def run_de(matrix: pd.DataFrame, groups: pd.Series, min_count: float = 0.0) -> pd.DataFrame:
    """Backward-compatible: groups values are control|treatment."""
    ctrl = groups[groups == "control"].index.tolist()
    treat = groups[groups == "treatment"].index.tolist()
    return run_de_samples(matrix, ctrl, treat, min_count=min_count)
