"""Differential expression (Welch t-test + BH FDR)."""
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


def run_de(matrix: pd.DataFrame, groups: pd.Series, min_count: float = 0.0) -> pd.DataFrame:
    """matrix: genes x samples; groups index=sample, values control|treatment."""
    ctrl = groups[groups == "control"].index.tolist()
    treat = groups[groups == "treatment"].index.tolist()
    missing = [s for s in ctrl + treat if s not in matrix.columns]
    if missing:
        raise ValueError(f"分组样本不在矩阵中: {missing}")
    if len(ctrl) < 2 or len(treat) < 2:
        raise ValueError("对照与实验组各自至少需要 2 个样本")

    X = matrix[ctrl + treat].astype(float)
    # filter near-zero genes
    keep = (X.sum(axis=1) > min_count) & (X.var(axis=1) > 0)
    X = X.loc[keep]
    logX = np.log2(X + 1.0)

    ctrl_vals = logX[ctrl].to_numpy()
    treat_vals = logX[treat].to_numpy()
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
    out["significant"] = (out["padj"] <= 0.05) & (out["log2FC"].abs() >= 1.0)
    out["regulation"] = np.where(
        out["significant"] & (out["log2FC"] > 0),
        "up",
        np.where(out["significant"] & (out["log2FC"] < 0), "down", "ns"),
    )
    return out.sort_values(["padj", "pvalue"]).reset_index(drop=True)
