"""One matrix and control/treatment groups → QC, DE, PCA, volcano, heatmap, Venn, enrichment."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import traceback
import zipfile
from pathlib import Path

from rnaseq_viz.enrich import AnnotationMissing, enrich, resolve_gmt
from rnaseq_viz.figures import LFC_CUT, PADJ_CUT, is_significant, write_bubble, write_heatmap, write_venn, write_volcano
from rnaseq_viz.pca import run_pca
from rnaseq_viz.stats import benjamini_hochberg, welch
from rnaseq_viz.table_io import UserInputError, load_expression

_SLUG = re.compile(r"[^A-Za-z0-9._-]+")


def slug(name: str, fallback: str) -> str:
    cleaned = _SLUG.sub("", name.strip())[:40]
    if not cleaned or cleaned[0] in ".-":
        return fallback
    return cleaned


def parse_treat(value: str) -> tuple[str, list[str]]:
    if "=" not in value:
        raise UserInputError("处理组写法是 名称=样本1,样本2")
    name, raw = value.split("=", 1)
    samples = [part.strip() for part in raw.split(",") if part.strip()]
    if not name.strip() or not samples:
        raise UserInputError("处理组需要名称和至少两个样本")
    return name.strip(), samples


def _split_samples(raw: str) -> list[str]:
    samples = [part.strip() for part in raw.split(",") if part.strip()]
    if len(samples) < 2:
        raise UserInputError("每一组至少需要 2 个生物学重复")
    if len(set(samples)) != len(samples):
        raise UserInputError("同一组里样本名重复")
    return samples


def assign_groups(samples: list[str], control: list[str], treatments: list[tuple[str, list[str]]]) -> None:
    if len(control) < 2:
        raise UserInputError("对照组至少需要 2 个生物学重复")
    if not treatments:
        raise UserInputError("至少指定一个处理组")
    if len(treatments) > 3:
        raise UserInputError("一次分析最多 3 个处理组（相对对照做韦恩图）")
    for name, members in treatments:
        if len(members) < 2:
            raise UserInputError(f"{name} 至少需要 2 个生物学重复")
    seen: dict[str, str] = {}
    for sample in control:
        if sample not in samples:
            raise UserInputError(f"对照样本不在矩阵表头中: {sample}")
        seen[sample] = "control"
    slugs = set()
    for name, members in treatments:
        token = slug(name, "")
        if not token or token in slugs or token == "control":
            raise UserInputError(f"处理组名称不可用: {name}")
        slugs.add(token)
        for sample in members:
            if sample not in samples:
                raise UserInputError(f"处理组样本不在矩阵表头中: {sample}")
            if sample in seen:
                raise UserInputError(f"样本被重复分组: {sample}")
            seen[sample] = name
    missing = [sample for sample in samples if sample not in seen]
    if missing:
        preview = "、".join(missing[:8])
        raise UserInputError(f"这些样本还没有分到对照或处理组: {preview}")


def differential(
    genes: list[str],
    matrix: list[list[float]],
    control_idx: list[int],
    treat_idx: list[int],
) -> list[dict]:
    pvalues: list[float] = []
    rows: list[dict] = []
    for gene, values in zip(genes, matrix):
        control = [values[i] for i in control_idx]
        treat = [values[i] for i in treat_idx]
        log2fc = (sum(treat) / len(treat)) - (sum(control) / len(control))
        t_stat, pvalue, df = welch(control, treat)
        rows.append(
            {
                "gene": gene,
                "log2fc": log2fc,
                "t": t_stat,
                "df": df,
                "pvalue": pvalue,
            }
        )
        pvalues.append(pvalue)
    adj = benjamini_hochberg(pvalues)
    for row, padj in zip(rows, adj):
        row["padj"] = padj
        row["direction"] = is_significant(row["log2fc"], padj)
    return rows


def _write_de(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("gene\tlog2FC\tt\tdf\tpvalue\tpadj\tdirection\n")
        for row in rows:
            handle.write(
                f"{row['gene']}\t{row['log2fc']:.6g}\t{row['t']:.6g}\t{row['df']:.6g}\t"
                f"{row['pvalue']:.6g}\t{row['padj']:.6g}\t{row['direction']}\n"
            )


def _significant(rows: list[dict]) -> list[dict]:
    return [row for row in rows if row["direction"] in {"up", "down"}]


def _heatmap_genes(comparisons: list[tuple[str, list[dict]]], limit: int = 30) -> list[str]:
    ranked: list[tuple[float, str]] = []
    seen: set[str] = set()
    for _name, rows in comparisons:
        sig = sorted(_significant(rows), key=lambda row: (row["padj"], -abs(row["log2fc"])))
        pool = sig or sorted(rows, key=lambda row: -abs(row["log2fc"]))[:10]
        for row in pool:
            if row["gene"] in seen:
                continue
            seen.add(row["gene"])
            ranked.append((abs(row["log2fc"]), row["gene"]))
    ranked.sort(reverse=True)
    return [gene for _score, gene in ranked[:limit]]


def _zip_dir(out_dir: Path, dest: Path) -> None:
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(out_dir.iterdir()):
            if path.name == dest.name or not path.is_file():
                continue
            archive.write(path, arcname=path.name)


def run_analysis(
    matrix: Path,
    out_dir: Path,
    control: list[str],
    treatments: list[tuple[str, list[str]]],
    species: str = "",
    annotation_dir: Path | None = None,
) -> dict:
    genes, samples, values = load_expression(matrix)
    assign_groups(samples, control, treatments)
    order = list(control) + [sample for _name, members in treatments for sample in members]
    index = {name: i for i, name in enumerate(samples)}
    ordered_idx = [index[name] for name in order]
    values = [[row[i] for i in ordered_idx] for row in values]
    samples = order
    group_labels = ["control"] * len(control) + [
        name for name, members in treatments for _sample in members
    ]
    if any(value < 0 for row in values for value in row):
        raise UserInputError("表达量含负数。请上传 TPM/FPKM，程序会做 log2(x+1)")
    raw_gene_count = len(genes)
    n_samples = len(values[0])
    filtered_genes: list[str] = []
    filtered_rows: list[list[float]] = []
    for gene, row in zip(genes, values):
        logged = [math.log2(value + 1.0) for value in row]
        mu = sum(logged) / n_samples
        var = sum((v - mu) ** 2 for v in logged) / (n_samples - 1)
        if var >= 1e-18:
            filtered_genes.append(gene)
            filtered_rows.append(logged)
    if len(filtered_genes) < 2:
        raise UserInputError("有效基因少于 2（其余方差为 0）")
    dropped = raw_gene_count - len(filtered_genes)
    genes = filtered_genes
    values = filtered_rows

    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "normalized.tsv").open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("gene_id\t" + "\t".join(samples) + "\n")
        for gene, row in zip(genes, values):
            handle.write(gene + "\t" + "\t".join(f"{v:.6g}" for v in row) + "\n")
    (out_dir / "qc_summary.json").write_text(
        json.dumps(
            {
                "transform": "log2(x+1)",
                "genes_in": raw_gene_count,
                "genes_used": len(genes),
                "genes_dropped": dropped,
                "samples": samples,
                "groups": group_labels,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    control_idx = list(range(len(control)))
    cursor = len(control)
    comparisons: list[tuple[str, str, list[dict]]] = []
    for name, members in treatments:
        treat_idx = list(range(cursor, cursor + len(members)))
        cursor += len(members)
        rows = differential(genes, values, control_idx, treat_idx)
        token = slug(name, "treat")
        _write_de(out_dir / f"de_{token}_vs_control.tsv", rows)
        write_volcano(
            out_dir / f"volcano_{token}_vs_control.svg",
            out_dir / f"volcano_{token}_vs_control.png",
            rows,
            f"{name} vs control",
        )
        comparisons.append((name, token, rows))

    meta_lines = ["sample\tgroup"]
    for sample, group in zip(samples, group_labels):
        meta_lines.append(f"{sample}\t{group}")
    meta_path = out_dir / "groups.tsv"
    meta_path.write_text("\n".join(meta_lines) + "\n", encoding="utf-8")
    pca_summary = run_pca(
        out_dir / "normalized.tsv",
        meta_path,
        out_dir,
        transform="none",
        scale="zscore",
    )

    heat_genes = _heatmap_genes([(name, rows) for name, _token, rows in comparisons])
    gene_index = {gene: i for i, gene in enumerate(genes)}
    heat_matrix = [values[gene_index[gene]] for gene in heat_genes]
    write_heatmap(out_dir / "heatmap.svg", out_dir / "heatmap.png", heat_genes, samples, group_labels, heat_matrix)

    venn: dict = {"skipped": True, "reason": "只有一个处理组时不做韦恩图"}
    if len(comparisons) >= 2:
        sets = [(token, {row["gene"] for row in _significant(rows)}) for _name, token, rows in comparisons]
        regions = write_venn(out_dir / "venn.svg", sets)
        with (out_dir / "venn_membership.tsv").open("w", encoding="utf-8", newline="\n") as handle:
            handle.write("region\tgene\n")
            for region, members in regions.items():
                for gene in members:
                    handle.write(f"{region}\t{gene}\n")
        venn = {"skipped": False, "regions": {key: len(val) for key, val in regions.items()}}

    enrichment: dict = {"ok": False, "species": species or None, "error": ""}
    if not species or species == "none":
        enrichment["error"] = "未选择物种，已跳过 GO/KEGG。其他图不受影响。"
        enrichment["skipped"] = True
    else:
        background = set(genes)
        primary = comparisons[0][2]
        sig_genes = {row["gene"] for row in _significant(primary)}
        try:
            go_path = resolve_gmt(species, "go", annotation_dir)
            go_rows = enrich(sig_genes, background, go_path)
            _write_enrichment_table(out_dir / f"go_{comparisons[0][1]}.tsv", go_rows)
            write_bubble(out_dir / "go_bubble.svg", "GO", go_rows)
            kegg_rows: list[dict] = []
            kegg_error = ""
            try:
                kegg_path = resolve_gmt(species, "kegg", annotation_dir)
                kegg_rows = enrich(sig_genes, background, kegg_path)
                _write_enrichment_table(out_dir / f"kegg_{comparisons[0][1]}.tsv", kegg_rows)
                write_bubble(out_dir / "kegg_bubble.svg", "KEGG", kegg_rows)
            except AnnotationMissing as exc:
                kegg_error = str(exc)
            enrichment = {
                "ok": True,
                "species": species,
                "comparison": comparisons[0][1],
                "go_terms": len(go_rows),
                "kegg_terms": len(kegg_rows),
                "kegg_error": kegg_error,
            }
        except AnnotationMissing as exc:
            enrichment = {"ok": False, "species": species, "error": str(exc), "skipped": False}
    (out_dir / "enrichment_status.json").write_text(
        json.dumps(enrichment, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    summary = {
        "input": "expression_matrix_plus_groups",
        "transform": "log2(x+1)",
        "genes_in": raw_gene_count,
        "genes_used": len(genes),
        "genes_dropped": dropped,
        "n_samples": len(samples),
        "control": control,
        "treatments": [{"name": name, "samples": members} for name, members in treatments],
        "thresholds": {"abs_log2fc": LFC_CUT, "padj": PADJ_CUT},
        "comparisons": [
            {
                "name": name,
                "token": token,
                "n_up": sum(1 for row in rows if row["direction"] == "up"),
                "n_down": sum(1 for row in rows if row["direction"] == "down"),
                "de": f"de_{token}_vs_control.tsv",
                "volcano_svg": f"volcano_{token}_vs_control.svg",
                "volcano_png": f"volcano_{token}_vs_control.png",
            }
            for name, token, rows in comparisons
        ],
        "pca": {
            "variance": pca_summary["variance"],
            "scores": pca_summary["scores"],
        },
        "heatmap_genes": heat_genes,
        "venn": venn,
        "enrichment": enrichment,
        "package": "results.zip",
    }
    (out_dir / "analysis_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    _zip_dir(out_dir, out_dir / "results.zip")
    return summary


def _write_enrichment_table(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("term\tdescription\thits\tterm_size\tpadj\tenrich_factor\tgenes\n")
        for row in rows:
            handle.write(
                f"{row['term']}\t{row['description']}\t{row['hits']}\t{row['term_size']}\t"
                f"{row['padj']:.6g}\t{row['enrich_factor']:.6g}\t{','.join(row['genes'])}\n"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="rnaseq-viz run",
        description="QC, differential expression, and figures from one expression matrix plus groups.",
    )
    parser.add_argument("--matrix", required=True, help="Gene x sample TPM/FPKM CSV or TSV")
    parser.add_argument("--control", required=True, help="Comma-separated control sample column names")
    parser.add_argument("--treat", action="append", required=True, help="Repeatable NAME=sample1,sample2")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--species", default="", help="Annotation directory name, or empty/none to skip enrichment")
    parser.add_argument("--annotation-dir", default="", help="Directory that contains <species>/go.gmt and kegg.gmt")
    args = parser.parse_args(argv)
    try:
        control = _split_samples(args.control)
        treatments = []
        for item in args.treat:
            name, members = parse_treat(item)
            members = _split_samples(",".join(members))
            treatments.append((name, members))
        run_analysis(
            matrix=Path(args.matrix),
            out_dir=Path(args.out_dir),
            control=control,
            treatments=treatments,
            species=args.species,
            annotation_dir=Path(args.annotation_dir) if args.annotation_dir else None,
        )
    except UserInputError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except Exception:
        traceback.print_exc()
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
