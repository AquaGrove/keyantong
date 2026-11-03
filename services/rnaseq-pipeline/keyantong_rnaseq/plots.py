"""Publication-ish static plots without heavy R deps."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def _save(fig: plt.Figure, out_base: Path) -> list[Path]:
    out_base.parent.mkdir(parents=True, exist_ok=True)
    paths = []
    for ext in ("png", "pdf"):
        p = out_base.with_suffix(f".{ext}")
        fig.savefig(p, dpi=160, bbox_inches="tight")
        paths.append(p)
    plt.close(fig)
    return paths


def plot_pca(matrix: pd.DataFrame, groups: pd.Series, out_base: Path, top_n: int = 500) -> list[Path]:
    samples = groups.index.tolist()
    X = np.log2(matrix[samples].astype(float) + 1.0)
    # top variable genes
    vars_ = X.var(axis=1).sort_values(ascending=False)
    keep = vars_.head(min(top_n, len(vars_))).index
    Y = X.loc[keep].T.to_numpy()
    Y = Y - Y.mean(axis=0, keepdims=True)
    # SVD PCA
    u, s, vt = np.linalg.svd(Y, full_matrices=False)
    scores = u[:, :2] * s[:2]
    var_exp = (s**2) / (s**2).sum()

    fig, ax = plt.subplots(figsize=(6.2, 5.2))
    colors = {"control": "#0f766e", "treatment": "#b45309"}
    for label in ("control", "treatment"):
        idx = [i for i, sname in enumerate(samples) if groups.loc[sname] == label]
        if not idx:
            continue
        ax.scatter(
            scores[idx, 0],
            scores[idx, 1],
            c=colors[label],
            label=label,
            s=70,
            edgecolors="white",
            linewidths=0.6,
        )
        for i in idx:
            ax.annotate(samples[i], (scores[i, 0], scores[i, 1]), fontsize=7, alpha=0.8)
    ax.set_xlabel(f"PC1 ({var_exp[0]*100:.1f}%)")
    ax.set_ylabel(f"PC2 ({var_exp[1]*100:.1f}%)")
    ax.set_title("PCA (log2 expression)")
    ax.legend(frameon=False)
    ax.axhline(0, color="#94a3b8", lw=0.6)
    ax.axvline(0, color="#94a3b8", lw=0.6)
    return _save(fig, out_base)


def plot_volcano(deg: pd.DataFrame, out_base: Path) -> list[Path]:
    df = deg.copy()
    df["neglog10p"] = -np.log10(df["pvalue"].clip(lower=1e-300))
    fig, ax = plt.subplots(figsize=(6.4, 5.4))
    colors = df["regulation"].map({"up": "#b91c1c", "down": "#1d4ed8", "ns": "#94a3b8"})
    ax.scatter(df["log2FC"], df["neglog10p"], c=colors, s=12, alpha=0.75, linewidths=0)
    ax.axvline(1, color="#64748b", ls="--", lw=0.8)
    ax.axvline(-1, color="#64748b", ls="--", lw=0.8)
    ax.axhline(-np.log10(0.05), color="#64748b", ls="--", lw=0.8)
    ax.set_xlabel("log2 fold change (treatment / control)")
    ax.set_ylabel("-log10(p-value)")
    ax.set_title("Volcano")
    n_up = int((df["regulation"] == "up").sum())
    n_down = int((df["regulation"] == "down").sum())
    ax.text(0.02, 0.98, f"up={n_up}  down={n_down}", transform=ax.transAxes, va="top", fontsize=9)
    return _save(fig, out_base)


def plot_heatmap(matrix: pd.DataFrame, groups: pd.Series, deg: pd.DataFrame, out_base: Path, top_n: int = 40) -> list[Path]:
    sig = deg[deg["regulation"].isin(["up", "down"])].head(top_n)
    if sig.empty:
        sig = deg.head(min(top_n, len(deg)))
    genes = sig["gene"].tolist()
    samples = groups.index.tolist()
    X = np.log2(matrix.loc[genes, samples].astype(float) + 1.0)
    # z-score genes
    Z = X.subtract(X.mean(axis=1), axis=0).divide(X.std(axis=1).replace(0, 1), axis=0)

    # order samples by group
    order = sorted(samples, key=lambda s: (0 if groups.loc[s] == "control" else 1, s))
    Z = Z[order]

    fig, ax = plt.subplots(figsize=(max(5.5, 0.45 * len(order) + 2), max(4.5, 0.22 * len(genes) + 1.5)))
    im = ax.imshow(Z.to_numpy(), aspect="auto", cmap="RdBu_r", vmin=-2, vmax=2)
    ax.set_xticks(range(len(order)))
    ax.set_xticklabels(order, rotation=45, ha="right", fontsize=8)
    ax.set_yticks(range(len(genes)))
    ax.set_yticklabels(genes, fontsize=7)
    ax.set_title("Heatmap (top DE genes, z-score)")
    # group color bar on top
    for i, s in enumerate(order):
        color = "#0f766e" if groups.loc[s] == "control" else "#b45309"
        ax.add_patch(plt.Rectangle((i - 0.5, -1.2), 1, 0.35, color=color, clip_on=False))
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="z-score")
    return _save(fig, out_base)


def plot_regulation_venn(deg: pd.DataFrame, out_base: Path) -> list[Path]:
    """Two-set style diagram for up vs down significant genes."""
    up = set(deg.loc[deg["regulation"] == "up", "gene"])
    down = set(deg.loc[deg["regulation"] == "down", "gene"])
    fig, ax = plt.subplots(figsize=(5.8, 5.0))
    c1 = plt.Circle((-0.55, 0), 1.0, color="#b91c1c", alpha=0.35)
    c2 = plt.Circle((0.55, 0), 1.0, color="#1d4ed8", alpha=0.35)
    ax.add_patch(c1)
    ax.add_patch(c2)
    ax.text(-0.9, 0.15, str(len(up)), ha="center", va="center", fontsize=16, fontweight="bold")
    ax.text(0.9, 0.15, str(len(down)), ha="center", va="center", fontsize=16, fontweight="bold")
    ax.text(0, 0, "0", ha="center", va="center", fontsize=12)  # disjoint by definition
    ax.text(-0.9, -1.25, "Up", ha="center")
    ax.text(0.9, -1.25, "Down", ha="center")
    ax.set_xlim(-2, 2)
    ax.set_ylim(-1.8, 1.6)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title("Significant genes: up vs down")
    paths = _save(fig, out_base)
    # membership csv next to plots
    members = pd.DataFrame(
        {
            "gene": list(up | down),
            "set": ["up" if g in up else "down" for g in list(up | down)],
        }
    ).sort_values(["set", "gene"])
    members_path = out_base.parent / "regulation_membership.csv"
    members.to_csv(members_path, index=False)
    paths.append(members_path)
    return paths
