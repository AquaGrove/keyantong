"""Differential expression (Welch t-test + BH FDR), single and multi-contrast."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats


def benjamini_hochberg(pvals: np.ndarray) -> np.ndarray:
    p = np.asarray(pvals, dtype=float)
    n = p.size
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


def run_de_samples(
    matrix: pd.DataFrame,
    control_samples: list[str],
    treatment_samples: list[str],
    *,
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
    min_count: float = 0.0,
    contrast_id: str = "",
) -> pd.DataFrame:
    """matrix: genes x samples; explicit sample lists for control / treatment."""
    missing = [s for s in control_samples + treatment_samples if s not in matrix.columns]
    if missing:
        raise ValueError(f"分组样本不在矩阵中: {missing}")
    if len(control_samples) < 2 or len(treatment_samples) < 2:
        raise ValueError("对照与实验组各自至少需要 2 个样本")

    X = matrix[control_samples + treatment_samples].astype(float)
    keep = (X.sum(axis=1) > min_count) & (X.var(axis=1) > 0)
    X = X.loc[keep]
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

    padj = benjamini_hochberg(pvals)
    out = pd.DataFrame(
        {
            "gene": logX.index.astype(str),
            "log2FC": log2fc,
            "mean_control": mean_c,
            "mean_treatment": mean_t,
            "pvalue": pvals,
            "padj": padj,
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


def run_de(matrix: pd.DataFrame, groups: pd.Series, min_count: float = 0.0) -> pd.DataFrame:
    """Backward-compatible: groups values are control|treatment."""
    ctrl = groups[groups == "control"].index.tolist()
    treat = groups[groups == "treatment"].index.tolist()
    return run_de_samples(matrix, ctrl, treat, min_count=min_count)
