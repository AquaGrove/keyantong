"""Over-representation on a GMT file shipped with the deployment, not uploaded by the user."""

from __future__ import annotations

import math
from pathlib import Path

from rnaseq_viz.stats import benjamini_hochberg


class AnnotationMissing(Exception):
    pass


def log_choose(n: int, k: int) -> float:
    if k < 0 or k > n:
        return float("-inf")
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def hypergeom_sf(overlap: int, population: int, term_size: int, significant: int) -> float:
    if overlap <= 0:
        return 1.0
    denom = log_choose(population, significant)
    total = 0.0
    for x in range(overlap, min(term_size, significant) + 1):
        logp = log_choose(term_size, x) + log_choose(population - term_size, significant - x) - denom
        if math.isfinite(logp):
            total += math.exp(logp)
    return min(1.0, total)


def load_gmt(path: Path) -> list[tuple[str, str, set[str]]]:
    terms: list[tuple[str, str, set[str]]] = []
    text = path.read_text(encoding="utf-8-sig")
    for line in text.splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3:
            continue
        name, desc, genes = parts[0].strip(), parts[1].strip(), {g.strip() for g in parts[2:] if g.strip()}
        if name and genes:
            terms.append((name, desc, genes))
    if not terms:
        raise AnnotationMissing(f"{path.name} 里没有可用条目")
    return terms


def resolve_gmt(species: str, kind: str, annotation_dir: Path | None) -> Path:
    root = annotation_dir
    if root is None:
        import os

        env = os.environ.get("RNASEQ_ANNOTATION_DIR", "").strip()
        if env:
            root = Path(env)
        else:
            root = Path(__file__).resolve().parents[1] / "annotations"
    path = root / species / f"{kind}.gmt"
    if not path.is_file():
        raise AnnotationMissing(
            f"未找到物种 {species} 的 {kind.upper()} 注释库（annotations/{species}/{kind}.gmt，或环境变量 RNASEQ_ANNOTATION_DIR）。"
            "请按服务说明放置 GMT，或把物种设为 none。"
            "分析不会改成让你上传富集表。"
        )
    return path


def enrich(significant: set[str], background: set[str], gmt_path: Path, padj_cut: float = 0.05) -> list[dict]:
    terms = load_gmt(gmt_path)
    universe = set(background)
    sig = significant & universe
    rows: list[dict] = []
    pvalues: list[float] = []
    for name, desc, genes in terms:
        in_bg = genes & universe
        if len(in_bg) < 2 or not sig:
            continue
        hits = sig & in_bg
        if not hits:
            continue
        p = hypergeom_sf(len(hits), len(universe), len(in_bg), len(sig))
        rows.append(
            {
                "term": name,
                "description": desc,
                "hits": len(hits),
                "term_size": len(in_bg),
                "significant": len(sig),
                "background": len(universe),
                "genes": sorted(hits),
                "pvalue": p,
            }
        )
        pvalues.append(p)
    if not rows:
        return []
    adj = benjamini_hochberg(pvalues)
    kept = []
    for row, padj in zip(rows, adj):
        row["padj"] = padj
        row["enrich_factor"] = (row["hits"] / row["significant"]) / (row["term_size"] / row["background"])
        if padj <= padj_cut:
            kept.append(row)
    kept.sort(key=lambda r: (r["padj"], -r["hits"]))
    return kept
