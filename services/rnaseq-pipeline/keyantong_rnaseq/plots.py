"""Publication-ish static plots; multi-group colors and flexible Venns."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Circle
import numpy as np
import pandas as pd


def _setup_fonts() -> None:
    candidates = [
        "PingFang SC",
        "Heiti SC",
        "STHeiti",
        "Songti SC",
        "Hiragino Sans GB",
        "Noto Sans CJK SC",
        "Arial Unicode MS",
        "Microsoft YaHei",
    ]
    available = {f.name for f in font_manager.fontManager.ttflist}
    chosen = [c for c in candidates if c in available]
    if chosen:
        plt.rcParams["font.sans-serif"] = chosen + ["DejaVu Sans"]
        plt.rcParams["axes.unicode_minus"] = False


_setup_fonts()

# modest layout helpers for 2–4 set Venns
_VENN2 = [(-0.55, 0, 1.05), (0.55, 0, 1.05)]
_VENN3 = [(-0.55, 0.2, 1.0), (0.55, 0.2, 1.0), (0.0, -0.55, 1.0)]
_VENN4 = [(-0.7, 0.15, 0.95), (-0.2, 0.15, 0.95), (0.2, 0.15, 0.95), (0.7, 0.15, 0.95)]


def _save(fig: plt.Figure, out_base: Path) -> list[Path]:
    out_base.parent.mkdir(parents=True, exist_ok=True)
    paths = []
    for ext in ("png", "pdf"):
        p = out_base.with_suffix(f".{ext}")
        fig.savefig(p, dpi=160, bbox_inches="tight")
        paths.append(p)
    plt.close(fig)
    return paths


def _color_map(groups: pd.Series, color_by_label: dict[str, str] | None) -> dict[str, str]:
    defaults = ["#0f766e", "#b45309", "#7c3aed", "#be185d", "#0369a1", "#ca8a04"]
    labels = list(dict.fromkeys(groups.tolist()))
    out: dict[str, str] = {}
    for i, lab in enumerate(labels):
        if color_by_label and lab in color_by_label:
            out[lab] = color_by_label[lab]
        else:
            out[lab] = defaults[i % len(defaults)]
    return out


def plot_pca(
    matrix: pd.DataFrame,
    groups: pd.Series,
    out_base: Path,
    top_n: int = 500,
    color_by_label: dict[str, str] | None = None,
) -> list[Path]:
    samples = groups.index.tolist()
    X = np.log2(matrix[samples].astype(float) + 1.0)
    vars_ = X.var(axis=1).sort_values(ascending=False)
    keep = vars_.head(min(top_n, len(vars_))).index
    Y = X.loc[keep].T.to_numpy()
    Y = Y - Y.mean(axis=0, keepdims=True)
    u, s, vt = np.linalg.svd(Y, full_matrices=False)
    scores = u[:, :2] * s[:2]
    var_exp = (s**2) / (s**2).sum()
    cmap = _color_map(groups, color_by_label)

    fig, ax = plt.subplots(figsize=(6.4, 5.4))
    for label in dict.fromkeys(groups.tolist()):
        idx = [i for i, sname in enumerate(samples) if groups.loc[sname] == label]
        if not idx:
            continue
        ax.scatter(
            scores[idx, 0],
            scores[idx, 1],
            c=cmap[label],
            label=str(label),
            s=70,
            edgecolors="white",
            linewidths=0.6,
        )
        for i in idx:
            ax.annotate(samples[i], (scores[i, 0], scores[i, 1]), fontsize=7, alpha=0.8)
    ax.set_xlabel(f"PC1 ({var_exp[0]*100:.1f}%)")
    ax.set_ylabel(f"PC2 ({var_exp[1]*100:.1f}%)")
    ax.set_title("PCA (log2 expression)")
    ax.legend(frameon=False, fontsize=8)
    ax.axhline(0, color="#94a3b8", lw=0.6)
    ax.axvline(0, color="#94a3b8", lw=0.6)
    return _save(fig, out_base)


def plot_volcano(
    deg: pd.DataFrame,
    out_base: Path,
    *,
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
    title: str = "Volcano",
    up_color: str = "#b91c1c",
    down_color: str = "#1d4ed8",
) -> list[Path]:
    df = deg.copy()
    df["neglog10p"] = -np.log10(df["pvalue"].clip(lower=1e-300))
    fig, ax = plt.subplots(figsize=(6.4, 5.4))
    colors = df["regulation"].map({"up": up_color, "down": down_color, "ns": "#94a3b8"})
    ax.scatter(df["log2FC"], df["neglog10p"], c=colors, s=12, alpha=0.75, linewidths=0)
    ax.axvline(lfc_cutoff, color="#64748b", ls="--", lw=0.8)
    ax.axvline(-lfc_cutoff, color="#64748b", ls="--", lw=0.8)
    ax.axhline(-np.log10(max(padj_cutoff, 1e-300)), color="#64748b", ls="--", lw=0.8)
    ax.set_xlabel("log2 fold change (treatment / control)")
    ax.set_ylabel("-log10(p-value)")
    ax.set_title(title)
    n_up = int((df["regulation"] == "up").sum())
    n_down = int((df["regulation"] == "down").sum())
    ax.text(0.02, 0.98, f"up={n_up}  down={n_down}", transform=ax.transAxes, va="top", fontsize=9)
    return _save(fig, out_base)


def plot_heatmap(
    matrix: pd.DataFrame,
    groups: pd.Series,
    deg: pd.DataFrame,
    out_base: Path,
    top_n: int = 40,
    color_by_label: dict[str, str] | None = None,
) -> list[Path]:
    sig = deg[deg["regulation"].isin(["up", "down"])].head(top_n)
    if sig.empty:
        sig = deg.head(min(top_n, len(deg)))
    genes = sig["gene"].tolist()
    samples = groups.index.tolist()
    X = np.log2(matrix.loc[genes, samples].astype(float) + 1.0)
    Z = X.subtract(X.mean(axis=1), axis=0).divide(X.std(axis=1).replace(0, 1), axis=0)
    label_order = list(dict.fromkeys(groups.tolist()))
    order = sorted(samples, key=lambda s: (label_order.index(groups.loc[s]), s))
    Z = Z[order]
    cmap = _color_map(groups, color_by_label)

    fig, ax = plt.subplots(figsize=(max(5.5, 0.45 * len(order) + 2), max(4.5, 0.22 * len(genes) + 1.5)))
    im = ax.imshow(Z.to_numpy(), aspect="auto", cmap="RdBu_r", vmin=-2, vmax=2)
    ax.set_xticks(range(len(order)))
    ax.set_xticklabels(order, rotation=45, ha="right", fontsize=8)
    ax.set_yticks(range(len(genes)))
    ax.set_yticklabels(genes, fontsize=7)
    ax.set_title("Heatmap (top DE genes, z-score)")
    for i, s in enumerate(order):
        ax.add_patch(plt.Rectangle((i - 0.5, -1.2), 1, 0.35, color=cmap[groups.loc[s]], clip_on=False))
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="z-score")
    return _save(fig, out_base)


def plot_regulation_venn(
    deg: pd.DataFrame,
    out_base: Path,
    *,
    up_color: str = "#b91c1c",
    down_color: str = "#1d4ed8",
    title: str = "Significant genes: up vs down",
) -> list[Path]:
    up = set(deg.loc[deg["regulation"] == "up", "gene"].astype(str))
    down = set(deg.loc[deg["regulation"] == "down", "gene"].astype(str))
    fig, ax = plt.subplots(figsize=(5.8, 5.0))
    ax.add_patch(Circle((-0.55, 0), 1.0, color=up_color, alpha=0.35))
    ax.add_patch(Circle((0.55, 0), 1.0, color=down_color, alpha=0.35))
    ax.text(-0.9, 0.15, str(len(up)), ha="center", va="center", fontsize=16, fontweight="bold")
    ax.text(0.9, 0.15, str(len(down)), ha="center", va="center", fontsize=16, fontweight="bold")
    ax.text(0, 0, "0", ha="center", va="center", fontsize=12)
    ax.text(-0.9, -1.25, "Up", ha="center", color=up_color)
    ax.text(0.9, -1.25, "Down", ha="center", color=down_color)
    ax.set_xlim(-2, 2)
    ax.set_ylim(-1.8, 1.6)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title(title)
    paths = _save(fig, out_base)
    members = pd.DataFrame(
        {"gene": list(up | down), "set": ["up" if g in up else "down" for g in list(up | down)]}
    ).sort_values(["set", "gene"])
    members_path = out_base.parent / f"{out_base.name}_membership.csv"
    members.to_csv(members_path, index=False)
    paths.append(members_path)
    return paths


def _set_counts(sets: dict[str, set[str]]) -> dict[str, int]:
    """Return exclusive region counts for up to 4 labeled sets (approx labels for display)."""
    labels = list(sets.keys())
    n = len(labels)
    counts: dict[str, int] = {}
    if n == 0:
        return counts
    # only totals + pairwise intersections for annotation simplicity
    for lab in labels:
        counts[lab] = len(sets[lab])
    if n >= 2:
        for i in range(n):
            for j in range(i + 1, n):
                a, b = labels[i], labels[j]
                counts[f"{a}&{b}"] = len(sets[a] & sets[b])
    if n >= 3:
        counts["&".join(labels[:3])] = len(sets[labels[0]] & sets[labels[1]] & sets[labels[2]])
    if n == 4:
        counts["all4"] = len(sets[labels[0]] & sets[labels[1]] & sets[labels[2]] & sets[labels[3]])
    return counts


def plot_multi_set_venn(
    sets: dict[str, set[str]],
    out_base: Path,
    *,
    colors: list[str] | None = None,
    title: str = "Multi-set Venn",
) -> list[Path]:
    labels = list(sets.keys())
    n = len(labels)
    if n < 2:
        # still write membership
        fig, ax = plt.subplots(figsize=(5, 4))
        ax.text(0.5, 0.5, "Need ≥2 sets for Venn", ha="center", va="center")
        ax.axis("off")
        paths = _save(fig, out_base)
    elif n > 4:
        # fall back to size bars + pairwise table look
        fig, ax = plt.subplots(figsize=(7.2, 4.8))
        sizes = [len(sets[lab]) for lab in labels]
        palette = colors or ["#0f766e", "#b45309", "#7c3aed", "#be185d", "#0369a1"]
        ax.barh(labels, sizes, color=[palette[i % len(palette)] for i in range(n)])
        ax.set_xlabel("# genes")
        ax.set_title(title + " (n>4: size bars; see membership CSV)")
        paths = _save(fig, out_base)
    else:
        layouts = {2: _VENN2, 3: _VENN3, 4: _VENN4}[n]
        palette = colors or ["#0f766e", "#b45309", "#7c3aed", "#be185d"]
        fig, ax = plt.subplots(figsize=(6.6, 5.6))
        for i, (x, y, r) in enumerate(layouts):
            ax.add_patch(Circle((x, y), r, color=palette[i % len(palette)], alpha=0.32))
            ax.text(x, y + r * 0.72, labels[i], ha="center", va="center", fontsize=9, fontweight="600")
            # exclusive-ish count near center of circle
            only = sets[labels[i]].copy()
            for j, other in enumerate(labels):
                if j != i:
                    only -= sets[other]
            ax.text(x, y, str(len(only)), ha="center", va="center", fontsize=13, fontweight="bold")
        counts = _set_counts(sets)
        # annotate pairwise center for 2-set
        if n == 2:
            inter = len(sets[labels[0]] & sets[labels[1]])
            ax.text(0, 0, str(inter), ha="center", va="center", fontsize=12)
        elif n == 3:
            inter = len(sets[labels[0]] & sets[labels[1]] & sets[labels[2]])
            ax.text(0, -0.05, str(inter), ha="center", va="center", fontsize=11)
        ax.set_xlim(-2.2, 2.2)
        ax.set_ylim(-2.0, 1.8)
        ax.set_aspect("equal")
        ax.axis("off")
        ax.set_title(title)
        # legend of totals
        legend = ", ".join(f"{lab}={counts.get(lab, 0)}" for lab in labels)
        ax.text(0, -1.85, legend, ha="center", fontsize=8, color="#334155")
        paths = _save(fig, out_base)

    # long membership table
    rows = []
    for lab, genes in sets.items():
        for g in sorted(genes):
            rows.append({"gene": g, "set": lab})
    # also presence matrix
    all_genes = sorted(set().union(*sets.values())) if sets else []
    presence = []
    for g in all_genes:
        row = {"gene": g}
        for lab in labels:
            row[lab] = int(g in sets[lab])
        presence.append(row)
    mem_path = out_base.parent / f"{out_base.name}_membership.csv"
    pd.DataFrame(rows).to_csv(mem_path, index=False)
    pres_path = out_base.parent / f"{out_base.name}_presence.csv"
    pd.DataFrame(presence).to_csv(pres_path, index=False)
    paths.extend([mem_path, pres_path])
    return paths
