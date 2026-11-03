"""Publication-ish static plots; accurate 2–4 set Venns; SVG/PDF/PNG export."""
from __future__ import annotations

from itertools import combinations
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Circle
import numpy as np
import pandas as pd

COLORBLIND_PALETTES = {
    "default": ["#0f766e", "#b45309", "#7c3aed", "#be185d", "#0369a1", "#ca8a04"],
    "okabe_ito": ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#F0E442", "#000000"],
    "tol_bright": ["#4477AA", "#EE6677", "#228833", "#CCBB44", "#66CCEE", "#AA3377", "#BBBBBB"],
    "colorblind": ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9", "#D55E00"],
}


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

_VENN2 = [(-0.55, 0, 1.05), (0.55, 0, 1.05)]
_VENN3 = [(-0.55, 0.25, 1.0), (0.55, 0.25, 1.0), (0.0, -0.55, 1.0)]
_VENN4 = [(-0.75, 0.2, 0.95), (-0.25, 0.35, 0.95), (0.25, 0.35, 0.95), (0.75, 0.2, 0.95)]


def palette_colors(name: str | None, n: int) -> list[str]:
    key = (name or "default").lower()
    base = COLORBLIND_PALETTES.get(key) or COLORBLIND_PALETTES["default"]
    return [base[i % len(base)] for i in range(n)]


def _save(
    fig: plt.Figure,
    out_base: Path,
    *,
    dpi: int = 160,
    formats: tuple[str, ...] = ("png", "pdf", "svg"),
) -> list[Path]:
    out_base.parent.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for ext in formats:
        p = out_base.with_suffix(f".{ext}")
        fig.savefig(p, dpi=dpi, bbox_inches="tight")
        paths.append(p)
    plt.close(fig)
    return paths


def _color_map(
    groups: pd.Series,
    color_by_label: dict[str, str] | None,
    palette: str | None = None,
) -> dict[str, str]:
    defaults = palette_colors(palette, 12)
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
    *,
    title: str = "PCA (log2 expression)",
    dpi: int = 160,
    palette: str | None = None,
    formats: tuple[str, ...] = ("png", "pdf", "svg"),
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
    cmap = _color_map(groups, color_by_label, palette)

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
    ax.set_title(title)
    ax.legend(frameon=False, fontsize=8)
    ax.axhline(0, color="#94a3b8", lw=0.6)
    ax.axvline(0, color="#94a3b8", lw=0.6)
    return _save(fig, out_base, dpi=dpi, formats=formats)


def plot_volcano(
    deg: pd.DataFrame,
    out_base: Path,
    *,
    lfc_cutoff: float = 1.0,
    padj_cutoff: float = 0.05,
    title: str = "Volcano",
    up_color: str = "#b91c1c",
    down_color: str = "#1d4ed8",
    dpi: int = 160,
    formats: tuple[str, ...] = ("png", "pdf", "svg"),
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
    return _save(fig, out_base, dpi=dpi, formats=formats)


def plot_heatmap(
    matrix: pd.DataFrame,
    groups: pd.Series,
    deg: pd.DataFrame,
    out_base: Path,
    top_n: int = 40,
    color_by_label: dict[str, str] | None = None,
    *,
    title: str = "Heatmap (top DE genes, z-score)",
    dpi: int = 160,
    palette: str | None = None,
    formats: tuple[str, ...] = ("png", "pdf", "svg"),
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
    cmap = _color_map(groups, color_by_label, palette)

    fig, ax = plt.subplots(figsize=(max(5.5, 0.45 * len(order) + 2), max(4.5, 0.22 * len(genes) + 1.5)))
    im = ax.imshow(Z.to_numpy(), aspect="auto", cmap="RdBu_r", vmin=-2, vmax=2)
    ax.set_xticks(range(len(order)))
    ax.set_xticklabels(order, rotation=45, ha="right", fontsize=8)
    ax.set_yticks(range(len(genes)))
    ax.set_yticklabels(genes, fontsize=7)
    ax.set_title(title)
    for i, s in enumerate(order):
        ax.add_patch(plt.Rectangle((i - 0.5, -1.2), 1, 0.35, color=cmap[groups.loc[s]], clip_on=False))
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="z-score")
    return _save(fig, out_base, dpi=dpi, formats=formats)


def plot_regulation_venn(
    deg: pd.DataFrame,
    out_base: Path,
    *,
    up_color: str = "#b91c1c",
    down_color: str = "#1d4ed8",
    title: str = "Significant genes: up vs down",
    dpi: int = 160,
    formats: tuple[str, ...] = ("png", "pdf", "svg"),
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
    paths = _save(fig, out_base, dpi=dpi, formats=formats)
    members = pd.DataFrame(
        {"gene": list(up | down), "set": ["up" if g in up else "down" for g in list(up | down)]}
    ).sort_values(["set", "gene"])
    members_path = out_base.parent / f"{out_base.name}_membership.csv"
    members.to_csv(members_path, index=False)
    paths.append(members_path)
    return paths


def exclusive_region_counts(sets: dict[str, set[str]]) -> dict[str, int]:
    """Exact exclusive region counts for all non-empty intersections (2^n - 1 regions)."""
    labels = list(sets.keys())
    n = len(labels)
    counts: dict[str, int] = {}
    if n == 0:
        return counts
    for r in range(1, n + 1):
        for combo in combinations(range(n), r):
            key = "&".join(labels[i] for i in combo)
            genes = set.intersection(*(sets[labels[i]] for i in combo))
            others = [labels[j] for j in range(n) if j not in combo]
            for o in others:
                genes = genes - sets[o]
            counts[key] = len(genes)
    return counts


def _write_set_tables(sets: dict[str, set[str]], out_base: Path, region_counts: dict[str, int]) -> list[Path]:
    labels = list(sets.keys())
    rows = []
    for lab, genes in sets.items():
        for g in sorted(genes):
            rows.append({"gene": g, "set": lab})
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
    region_path = out_base.parent / f"{out_base.name}_regions.csv"
    pd.DataFrame([{"region": k, "count": v} for k, v in region_counts.items()]).to_csv(region_path, index=False)
    return [mem_path, pres_path, region_path]


def plot_multi_set_venn(
    sets: dict[str, set[str]],
    out_base: Path,
    *,
    colors: list[str] | None = None,
    title: str = "Multi-set Venn",
    dpi: int = 160,
    formats: tuple[str, ...] = ("png", "pdf", "svg"),
    palette: str | None = None,
) -> list[Path]:
    labels = list(sets.keys())
    n = len(labels)
    region_counts = exclusive_region_counts(sets)
    palette_list = colors or palette_colors(palette, max(n, 1))

    if n < 2:
        fig, ax = plt.subplots(figsize=(5, 4))
        ax.text(0.5, 0.5, "Need ≥2 sets for Venn", ha="center", va="center")
        ax.axis("off")
        ax.set_title(title)
        paths = _save(fig, out_base, dpi=dpi, formats=formats)
    elif n > 4:
        fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.8), gridspec_kw={"width_ratios": [1, 1.4]})
        sizes = [len(sets[lab]) for lab in labels]
        axes[0].barh(labels, sizes, color=[palette_list[i % len(palette_list)] for i in range(n)])
        axes[0].set_xlabel("# genes")
        axes[0].set_title("Set sizes")
        items = sorted(region_counts.items(), key=lambda kv: -kv[1])[:12]
        axes[1].barh([k for k, _ in items][::-1], [v for _, v in items][::-1], color="#334155")
        axes[1].set_xlabel("# genes (exclusive region)")
        axes[1].set_title("Top exclusive intersections")
        fig.suptitle(title + " (n>4: sizes + exclusive regions)")
        fig.tight_layout()
        paths = _save(fig, out_base, dpi=dpi, formats=formats)
    else:
        layouts = {2: _VENN2, 3: _VENN3, 4: _VENN4}[n]
        fig, ax = plt.subplots(figsize=(7.0, 6.0))
        for i, (x, y, r) in enumerate(layouts):
            ax.add_patch(Circle((x, y), r, color=palette_list[i % len(palette_list)], alpha=0.32))
            ax.text(x, y + r * 0.78, labels[i], ha="center", va="center", fontsize=9, fontweight="600")

        def _count(*idxs: int) -> int:
            key = "&".join(labels[i] for i in idxs)
            return region_counts.get(key, 0)

        if n == 2:
            ax.text(-0.95, 0, str(_count(0)), ha="center", va="center", fontsize=14, fontweight="bold")
            ax.text(0.95, 0, str(_count(1)), ha="center", va="center", fontsize=14, fontweight="bold")
            ax.text(0, 0, str(_count(0, 1)), ha="center", va="center", fontsize=13, fontweight="bold")
        elif n == 3:
            ax.text(-0.95, 0.35, str(_count(0)), ha="center", va="center", fontsize=12, fontweight="bold")
            ax.text(0.95, 0.35, str(_count(1)), ha="center", va="center", fontsize=12, fontweight="bold")
            ax.text(0.0, -0.95, str(_count(2)), ha="center", va="center", fontsize=12, fontweight="bold")
            ax.text(0.0, 0.45, str(_count(0, 1)), ha="center", va="center", fontsize=11)
            ax.text(-0.45, -0.25, str(_count(0, 2)), ha="center", va="center", fontsize=11)
            ax.text(0.45, -0.25, str(_count(1, 2)), ha="center", va="center", fontsize=11)
            ax.text(0.0, -0.05, str(_count(0, 1, 2)), ha="center", va="center", fontsize=12, fontweight="bold")
        else:
            # 4-set: label exclusive singles on each circle; place pairwise/triple
            # approximate midpoints; full exclusive table always in *_regions.csv.
            pos_single = [(-0.95, 0.35), (-0.2, 0.55), (0.2, 0.55), (0.95, 0.35)]
            for i, (x, y) in enumerate(pos_single):
                ax.text(x, y, str(_count(i)), ha="center", va="center", fontsize=11, fontweight="bold")
            # pairwise exclusive midpoints (approximate for side-by-side layout)
            pair_pos = {
                (0, 1): (-0.55, 0.35),
                (1, 2): (0.0, 0.42),
                (2, 3): (0.55, 0.35),
                (0, 2): (-0.35, 0.05),
                (1, 3): (0.35, 0.05),
                (0, 3): (0.0, -0.35),
            }
            for (i, j), (x, y) in pair_pos.items():
                ax.text(x, y, str(_count(i, j)), ha="center", va="center", fontsize=9, color="#1e293b")
            # triples
            trip_pos = {
                (0, 1, 2): (-0.25, 0.18),
                (1, 2, 3): (0.25, 0.18),
                (0, 1, 3): (-0.15, -0.05),
                (0, 2, 3): (0.15, -0.05),
            }
            for key, (x, y) in trip_pos.items():
                ax.text(x, y, str(_count(*key)), ha="center", va="center", fontsize=8, color="#334155")
            ax.text(0, -0.85, f"∩4={_count(0,1,2,3)}", ha="center", va="center", fontsize=11, fontweight="bold")
            ax.text(0, -1.55, "CSV authoritative: *_regions.csv / *_presence.csv", ha="center", fontsize=8, color="#475569")

        ax.set_xlim(-2.3, 2.3)
        ax.set_ylim(-2.1, 1.9)
        ax.set_aspect("equal")
        ax.axis("off")
        ax.set_title(title)
        totals = ", ".join(f"{lab}={len(sets[lab])}" for lab in labels)
        ax.text(0, -1.85, totals, ha="center", fontsize=8, color="#334155")
        paths = _save(fig, out_base, dpi=dpi, formats=formats)

    paths.extend(_write_set_tables(sets, out_base, region_counts))
    return paths
