"""Pluggable GO enrichment with local/cacheable gene→term mappings."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import hypergeom

# species key → relative annotation path under package annotations/
SPECIES_MAP: dict[str, dict[str, str]] = {
    "demo": {
        "label": "Demo (fixture annotation)",
        "gene2go": "demo/gene2go.tsv",
    },
    "human": {
        "label": "Homo sapiens (local cache if present)",
        "gene2go": "human/gene2go.tsv",
    },
    "mouse": {
        "label": "Mus musculus (local cache if present)",
        "gene2go": "mouse/gene2go.tsv",
    },
    "arabidopsis": {
        "label": "Arabidopsis thaliana (local cache if present)",
        "gene2go": "arabidopsis/gene2go.tsv",
    },
}

ALIAS = {
    "none": "none",
    "na": "none",
    "null": "none",
    "": "none",
    "hs": "human",
    "hsa": "human",
    "homo_sapiens": "human",
    "homo sapiens": "human",
    "mm": "mouse",
    "mmu": "mouse",
    "mus_musculus": "mouse",
    "mus musculus": "mouse",
    "ath": "arabidopsis",
    "arabidopsis_thaliana": "arabidopsis",
}


@dataclass
class EnrichmentResult:
    status: str
    reason: str
    species: str
    n_query: int = 0
    n_annotated_query: int = 0
    n_terms_tested: int = 0
    table: str | None = None
    artifacts: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def annotations_root() -> Path:
    return Path(__file__).resolve().parent.parent / "annotations"


def normalize_species(species: str | None) -> str:
    raw = (species or "none").strip().lower()
    return ALIAS.get(raw, raw)


def resolve_gene2go(species: str) -> Path | None:
    key = normalize_species(species)
    if key in {"none"}:
        return None
    meta = SPECIES_MAP.get(key)
    if not meta:
        # allow direct custom folder name
        candidate = annotations_root() / key / "gene2go.tsv"
        return candidate if candidate.is_file() else None
    path = annotations_root() / meta["gene2go"]
    return path if path.is_file() else None


def load_gene2go(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, sep="\t")
    cols = {c.lower(): c for c in df.columns}
    gene_col = cols.get("gene") or cols.get("gene_id") or list(df.columns)[0]
    term_col = cols.get("go_id") or cols.get("term") or cols.get("term_id") or list(df.columns)[1]
    name_col = cols.get("go_name") or cols.get("term_name") or cols.get("name")
    out = pd.DataFrame(
        {
            "gene": df[gene_col].astype(str),
            "term": df[term_col].astype(str),
            "term_name": df[name_col].astype(str) if name_col else df[term_col].astype(str),
        }
    )
    return out.drop_duplicates()


def _bh(p: np.ndarray) -> np.ndarray:
    n = len(p)
    order = np.argsort(p)
    ranked = p[order]
    adj = np.empty(n)
    prev = 1.0
    for i in range(n - 1, -1, -1):
        val = ranked[i] * n / (i + 1)
        prev = min(prev, val)
        adj[order[i]] = prev
    return np.clip(adj, 0, 1)


def enrich_hypergeometric(
    query_genes: list[str],
    mapping: pd.DataFrame,
    *,
    min_term_size: int = 3,
    max_term_size: int = 500,
) -> pd.DataFrame:
    query = set(map(str, query_genes))
    universe = set(mapping["gene"].astype(str))
    annotated_query = query & universe
    if not annotated_query:
        return pd.DataFrame()
    N = len(universe)
    n = len(annotated_query)
    rows = []
    for term, sub in mapping.groupby("term"):
        term_genes = set(sub["gene"].astype(str))
        K = len(term_genes)
        if K < min_term_size or K > max_term_size:
            continue
        k = len(annotated_query & term_genes)
        if k == 0:
            continue
        # P(X >= k)
        p = hypergeom.sf(k - 1, N, K, n)
        rows.append(
            {
                "term": term,
                "term_name": str(sub["term_name"].iloc[0]),
                "overlap": k,
                "term_size": K,
                "query_annotated": n,
                "universe": N,
                "pvalue": float(p),
                "genes": ",".join(sorted(annotated_query & term_genes)[:40]),
            }
        )
    if not rows:
        return pd.DataFrame()
    out = pd.DataFrame(rows)
    out["padj"] = _bh(out["pvalue"].to_numpy(dtype=float))
    return out.sort_values(["padj", "pvalue"]).reset_index(drop=True)


def run_enrichment(
    sig_genes: list[str],
    species: str | None,
    outdir: Path,
) -> EnrichmentResult:
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    key = normalize_species(species)
    status_path = outdir / "enrichment_status.txt"
    meta_path = outdir / "enrichment_meta.json"

    if key == "none":
        reason = "GO/KEGG 未运行：未选择物种（species=none）。"
        status_path.write_text(reason + "\n", encoding="utf-8")
        meta = EnrichmentResult(status="skipped_no_species", reason=reason, species=key)
        meta_path.write_text(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        return meta

    path = resolve_gene2go(key)
    if path is None:
        known = ", ".join(sorted(SPECIES_MAP))
        reason = (
            f"物种「{species}」无可用本地注释（期望 {annotations_root()}/<species>/gene2go.tsv）。"
            f"已支持内置键: {known}。可将映射表放入 annotations 目录后重跑。"
        )
        status_path.write_text(reason + "\n", encoding="utf-8")
        meta = EnrichmentResult(status="skipped_no_annotation", reason=reason, species=key, n_query=len(sig_genes))
        meta_path.write_text(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        return meta

    if not sig_genes:
        reason = "无显著基因，跳过富集。"
        status_path.write_text(reason + "\n", encoding="utf-8")
        meta = EnrichmentResult(status="skipped_no_sig_genes", reason=reason, species=key)
        meta_path.write_text(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        return meta

    mapping = load_gene2go(path)
    table = enrich_hypergeometric(sig_genes, mapping)
    table_path = outdir / "go_enrichment.csv"
    table.to_csv(table_path, index=False)
    annotated = len(set(map(str, sig_genes)) & set(mapping["gene"].astype(str)))
    reason = (
        f"已用本地注释 {path} 对 {len(sig_genes)} 个显著基因做 GO 超几何检验；"
        f"注释命中 {annotated}；检出 terms={len(table)}。"
        "（当前切片未内置完整 KEGG；GO 为可插拔本地映射。）"
    )
    status_path.write_text(reason + "\n", encoding="utf-8")
    meta = EnrichmentResult(
        status="ok" if len(table) else "ok_empty",
        reason=reason,
        species=key,
        n_query=len(sig_genes),
        n_annotated_query=annotated,
        n_terms_tested=int(len(table)),
        table=str(table_path),
        artifacts=[str(table_path), str(status_path), str(meta_path)],
    )
    meta_path.write_text(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    if meta.artifacts is None:
        meta.artifacts = [str(status_path), str(meta_path)]
    else:
        meta.artifacts = list(dict.fromkeys(meta.artifacts + [str(status_path), str(meta_path)]))
    return meta
