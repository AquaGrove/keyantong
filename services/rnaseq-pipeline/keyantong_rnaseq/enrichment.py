"""Pluggable GO + KEGG enrichment with local/cacheable gene→term mappings."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import hypergeom

SPECIES_MAP: dict[str, dict[str, str]] = {
    "demo": {
        "label": "Demo (fixture annotation)",
        "gene2go": "demo/gene2go.tsv",
        "gene2kegg": "demo/gene2kegg.tsv",
    },
    "human": {
        "label": "Homo sapiens (local cache if present)",
        "gene2go": "human/gene2go.tsv",
        "gene2kegg": "human/gene2kegg.tsv",
    },
    "mouse": {
        "label": "Mus musculus (local cache if present)",
        "gene2go": "mouse/gene2go.tsv",
        "gene2kegg": "mouse/gene2kegg.tsv",
    },
    "arabidopsis": {
        "label": "Arabidopsis thaliana (local cache if present)",
        "gene2go": "arabidopsis/gene2go.tsv",
        "gene2kegg": "arabidopsis/gene2kegg.tsv",
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
    n_kegg_tested: int = 0
    table: str | None = None
    kegg_table: str | None = None
    artifacts: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def annotations_root() -> Path:
    return Path(__file__).resolve().parent.parent / "annotations"


def normalize_species(species: str | None) -> str:
    raw = (species or "none").strip().lower()
    return ALIAS.get(raw, raw)


def list_species_status() -> list[dict[str, Any]]:
    rows = []
    for key, meta in SPECIES_MAP.items():
        go = annotations_root() / meta["gene2go"]
        kegg = annotations_root() / meta.get("gene2kegg", f"{key}/gene2kegg.tsv")
        rows.append(
            {
                "species": key,
                "label": meta.get("label", key),
                "gene2go": str(go) if go.is_file() else None,
                "gene2kegg": str(kegg) if kegg.is_file() else None,
                "ready_go": go.is_file(),
                "ready_kegg": kegg.is_file(),
            }
        )
    root = annotations_root()
    if root.is_dir():
        known = set(SPECIES_MAP)
        for child in sorted(root.iterdir()):
            if not child.is_dir() or child.name in known or child.name.startswith("."):
                continue
            go = child / "gene2go.tsv"
            kegg = child / "gene2kegg.tsv"
            rows.append(
                {
                    "species": child.name,
                    "label": f"custom:{child.name}",
                    "gene2go": str(go) if go.is_file() else None,
                    "gene2kegg": str(kegg) if kegg.is_file() else None,
                    "ready_go": go.is_file(),
                    "ready_kegg": kegg.is_file(),
                }
            )
    return rows


def resolve_annotation(species: str, kind: str) -> Path | None:
    key = normalize_species(species)
    if key in {"none"}:
        return None
    meta = SPECIES_MAP.get(key)
    if meta and kind in meta:
        path = annotations_root() / meta[kind]
        return path if path.is_file() else None
    candidate = annotations_root() / key / f"{kind}.tsv"
    return candidate if candidate.is_file() else None


def resolve_gene2go(species: str) -> Path | None:
    return resolve_annotation(species, "gene2go")


def resolve_gene2kegg(species: str) -> Path | None:
    return resolve_annotation(species, "gene2kegg")


def load_gene_mapping(
    path: Path,
    *,
    id_aliases: tuple[str, ...],
    name_aliases: tuple[str, ...],
) -> pd.DataFrame:
    head = path.read_text(encoding="utf-8", errors="replace").splitlines()[:1]
    if head and "\t" in head[0]:
        sep = "\t"
    elif head and "," in head[0]:
        sep = ","
    else:
        sep = "\t"
    df = pd.read_csv(path, sep=sep)
    cols = {c.lower().strip(): c for c in df.columns}
    gene_col = None
    for a in ("gene", "gene_id", "geneid", "symbol", "gene_symbol", "orf"):
        if a in cols:
            gene_col = cols[a]
            break
    if gene_col is None:
        gene_col = list(df.columns)[0]
    term_col = None
    for a in id_aliases:
        if a in cols:
            term_col = cols[a]
            break
    if term_col is None:
        term_col = list(df.columns)[1] if len(df.columns) > 1 else list(df.columns)[0]
    name_col = None
    for a in name_aliases:
        if a in cols:
            name_col = cols[a]
            break
    out = pd.DataFrame(
        {
            "gene": df[gene_col].astype(str),
            "term": df[term_col].astype(str),
            "term_name": df[name_col].astype(str) if name_col else df[term_col].astype(str),
        }
    )
    return out.drop_duplicates()


def load_gene2go(path: Path) -> pd.DataFrame:
    return load_gene_mapping(
        path,
        id_aliases=("go_id", "term", "term_id", "goid", "id"),
        name_aliases=("go_name", "term_name", "name", "description"),
    )


def load_gene2kegg(path: Path) -> pd.DataFrame:
    return load_gene_mapping(
        path,
        id_aliases=("kegg_id", "pathway", "pathway_id", "term", "term_id", "id"),
        name_aliases=("kegg_name", "pathway_name", "term_name", "name", "description"),
    )


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
    artifacts: list[str] = []

    if key == "none":
        reason = "GO/KEGG 未运行：未选择物种（species=none）。"
        status_path.write_text(reason + "\n", encoding="utf-8")
        meta = EnrichmentResult(status="skipped_no_species", reason=reason, species=key)
        meta_path.write_text(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        meta.artifacts = [str(status_path), str(meta_path)]
        return meta

    go_path = resolve_gene2go(key)
    kegg_path = resolve_gene2kegg(key)
    if go_path is None and kegg_path is None:
        known = ", ".join(sorted(SPECIES_MAP))
        reason = (
            f"物种「{species}」无可用本地注释（期望 {annotations_root()}/<species>/gene2go.tsv "
            f"和/或 gene2kegg.tsv）。已支持内置键: {known}。"
            "可将映射表放入 annotations 目录后重跑；见 annotations/README.md。"
        )
        status_path.write_text(reason + "\n", encoding="utf-8")
        meta = EnrichmentResult(
            status="skipped_no_annotation", reason=reason, species=key, n_query=len(sig_genes)
        )
        meta_path.write_text(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        meta.artifacts = [str(status_path), str(meta_path)]
        return meta

    if not sig_genes:
        reason = "无显著基因，跳过富集。"
        status_path.write_text(reason + "\n", encoding="utf-8")
        meta = EnrichmentResult(status="skipped_no_sig_genes", reason=reason, species=key)
        meta_path.write_text(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
        meta.artifacts = [str(status_path), str(meta_path)]
        return meta

    go_table = pd.DataFrame()
    kegg_table = pd.DataFrame()
    annotated = 0
    parts: list[str] = []

    if go_path is not None:
        mapping = load_gene2go(go_path)
        go_table = enrich_hypergeometric(sig_genes, mapping)
        table_path = outdir / "go_enrichment.csv"
        go_table.to_csv(table_path, index=False)
        artifacts.append(str(table_path))
        annotated = max(annotated, len(set(map(str, sig_genes)) & set(mapping["gene"].astype(str))))
        parts.append(f"GO:{go_path.name} terms={len(go_table)}")

    if kegg_path is not None:
        mapping_k = load_gene2kegg(kegg_path)
        kegg_table = enrich_hypergeometric(sig_genes, mapping_k, min_term_size=2, max_term_size=2000)
        kegg_out = outdir / "kegg_enrichment.csv"
        kegg_table.to_csv(kegg_out, index=False)
        artifacts.append(str(kegg_out))
        annotated = max(annotated, len(set(map(str, sig_genes)) & set(mapping_k["gene"].astype(str))))
        parts.append(f"KEGG:{kegg_path.name} pathways={len(kegg_table)}")

    reason = (
        f"已对 {len(sig_genes)} 个显著基因做本地超几何富集；注释命中≈{annotated}；"
        + "；".join(parts)
        + "。映射文件可替换/扩充，见 annotations/README.md。"
    )
    status_path.write_text(reason + "\n", encoding="utf-8")
    artifacts.extend([str(status_path), str(meta_path)])
    status = "ok" if (len(go_table) or len(kegg_table)) else "ok_empty"
    meta = EnrichmentResult(
        status=status,
        reason=reason,
        species=key,
        n_query=len(sig_genes),
        n_annotated_query=annotated,
        n_terms_tested=int(len(go_table)),
        n_kegg_tested=int(len(kegg_table)),
        table=str(outdir / "go_enrichment.csv") if go_path is not None else None,
        kegg_table=str(outdir / "kegg_enrichment.csv") if kegg_path is not None else None,
        artifacts=list(dict.fromkeys(artifacts)),
    )
    meta_path.write_text(json.dumps(meta.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return meta
