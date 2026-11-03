"""PCA on a gene × sample expression matrix. Pure Python; no hardcoded paths."""

from __future__ import annotations

import argparse
import json
import math
import sys
import traceback
from pathlib import Path

from rnaseq_viz.plot import write_plots
from rnaseq_viz.table_io import UserInputError, load_expression, load_metadata

__all__ = ["UserInputError", "main", "run_pca"]


def _jacobi(matrix: list[list[float]]) -> tuple[list[float], list[list[float]]]:
    """Symmetric eigendecomposition. Returns eigenvalues (desc) and eigenvectors (rows)."""
    n = len(matrix)
    a = [row[:] for row in matrix]
    v = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for _sweep in range(60):
        off = 0.0
        for p in range(n):
            for q in range(p + 1, n):
                off += abs(a[p][q])
        if off < 1e-12:
            break
        for p in range(n):
            for q in range(p + 1, n):
                apq = a[p][q]
                if abs(apq) < 1e-15:
                    continue
                app = a[p][p]
                aqq = a[q][q]
                tau = (aqq - app) / (2.0 * apq)
                if tau >= 0:
                    t = 1.0 / (tau + math.sqrt(1.0 + tau * tau))
                else:
                    t = -1.0 / (-tau + math.sqrt(1.0 + tau * tau))
                c = 1.0 / math.sqrt(1.0 + t * t)
                s = t * c
                a[p][p] = app - t * apq
                a[q][q] = aqq + t * apq
                a[p][q] = 0.0
                a[q][p] = 0.0
                for r in range(n):
                    if r == p or r == q:
                        continue
                    arp = a[r][p]
                    arq = a[r][q]
                    a[r][p] = a[p][r] = c * arp - s * arq
                    a[r][q] = a[q][r] = s * arp + c * arq
                for r in range(n):
                    vip = v[r][p]
                    viq = v[r][q]
                    v[r][p] = c * vip - s * viq
                    v[r][q] = s * vip + c * viq
    evals = [a[i][i] for i in range(n)]
    order = sorted(range(n), key=lambda i: evals[i], reverse=True)
    eigenvalues = [evals[i] for i in order]
    eigenvectors = [[v[r][i] for r in range(n)] for i in order]
    return eigenvalues, eigenvectors


def _transform(matrix: list[list[float]], transform: str) -> None:
    if transform == "none":
        return
    if transform != "log2":
        raise UserInputError("transform 只能是 none 或 log2")
    for row in matrix:
        for j, value in enumerate(row):
            if value < 0:
                raise UserInputError("log2 变换要求表达量非负，或改用 --transform none")
            row[j] = math.log2(value + 1.0)


def _scale(matrix: list[list[float]], mode: str) -> tuple[list[list[float]], int]:
    """Return samples × genes and the number of dropped genes."""
    if mode not in {"center", "zscore", "none"}:
        raise UserInputError("scale 只能是 center、zscore 或 none")
    n_genes = len(matrix)
    n_samples = len(matrix[0])
    kept: list[int] = []
    means: list[float] = []
    sds: list[float] = []
    for j in range(n_genes):
        column = [matrix[j][i] for i in range(n_samples)]
        mu = sum(column) / n_samples
        var = sum((v - mu) ** 2 for v in column) / (n_samples - 1)
        if var < 1e-18:
            continue
        kept.append(j)
        means.append(mu)
        sds.append(math.sqrt(var))
    dropped = n_genes - len(kept)
    if len(kept) < 2:
        raise UserInputError("有效基因少于 2（其余方差为 0）")
    scaled: list[list[float]] = []
    for i in range(n_samples):
        row: list[float] = []
        for k, j in enumerate(kept):
            value = matrix[j][i]
            if mode == "zscore":
                row.append((value - means[k]) / sds[k])
            elif mode == "center":
                row.append(value - means[k])
            else:
                row.append(value)
        scaled.append(row)
    return scaled, dropped


def _gram(x: list[list[float]]) -> list[list[float]]:
    n = len(x)
    p = len(x[0])
    g = [[0.0] * n for _ in range(n)]
    for i in range(n):
        xi = x[i]
        for j in range(i, n):
            dot = 0.0
            xj = x[j]
            for k in range(p):
                dot += xi[k] * xj[k]
            g[i][j] = dot
            g[j][i] = dot
    return g


def _scores(x: list[list[float]]) -> tuple[list[list[float]], list[float]]:
    evals, evecs = _jacobi(_gram(x))
    total = sum(v for v in evals if v > 0)
    if total <= 0:
        raise UserInputError("无法计算主成分")
    chosen: list[tuple[float, list[float]]] = []
    for lam, vec in zip(evals, evecs):
        if lam <= 1e-10:
            continue
        chosen.append((lam, vec))
        if len(chosen) == 2:
            break
    if not chosen:
        raise UserInputError("无法计算主成分")
    while len(chosen) < 2:
        chosen.append((0.0, [0.0] * len(x)))
    scores = []
    for i in range(len(x)):
        row = []
        for lam, vec in chosen:
            row.append(vec[i] * math.sqrt(max(lam, 0.0)))
        scores.append(row)
    for j in range(2):
        pivot = max(range(len(scores)), key=lambda i: abs(scores[i][j]))
        if scores[pivot][j] < 0:
            for i in range(len(scores)):
                scores[i][j] *= -1
    fractions = [(lam / total) if total else 0.0 for lam, _ in chosen]
    return scores, fractions


def _tsv(value: str) -> str:
    if any(ch in value for ch in "\t\n\r"):
        return value.replace("\t", " ").replace("\n", " ").replace("\r", " ")
    return value


def run_pca(
    matrix: Path,
    metadata: Path,
    out_dir: Path,
    transform: str = "none",
    scale: str = "center",
    gene_column: str = "",
    sample_column: str = "",
    group_column: str = "",
) -> dict:
    _genes, samples, values = load_expression(matrix, gene_column=gene_column)
    groups = load_metadata(
        metadata,
        samples,
        sample_column=sample_column,
        group_column=group_column,
    )
    _transform(values, transform)
    scaled, dropped = _scale(values, scale)
    scores, fractions = _scores(scaled)
    out_dir.mkdir(parents=True, exist_ok=True)
    score_rows = [
        {"sample": sample, "group": group, "PC1": pc1, "PC2": pc2}
        for sample, group, (pc1, pc2) in zip(samples, groups, scores)
    ]
    variance = [
        {"pc": "PC1", "fraction": fractions[0]},
        {"pc": "PC2", "fraction": fractions[1]},
    ]
    summary = {
        "genes_used": len(scaled[0]),
        "genes_dropped": dropped,
        "n_samples": len(samples),
        "transform": transform,
        "scale": scale,
        "variance": variance,
        "scores": score_rows,
    }
    (out_dir / "pca_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    with (out_dir / "pca_scores.tsv").open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("sample\tgroup\tPC1\tPC2\n")
        for row in score_rows:
            handle.write(
                f"{_tsv(row['sample'])}\t{_tsv(row['group'])}\t{row['PC1']:.6g}\t{row['PC2']:.6g}\n"
            )
    with (out_dir / "pca_variance.tsv").open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("pc\tvariance_fraction\n")
        for row in variance:
            handle.write(f"{row['pc']}\t{row['fraction']:.6g}\n")
    write_plots(out_dir, score_rows, fractions)
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="rnaseq-pca",
        description="PCA scatter from an expression matrix and a sample sheet.",
    )
    parser.add_argument("--matrix", required=True, help="Gene x sample CSV/TSV (gene id + sample columns)")
    parser.add_argument("--metadata", required=True, help="Sample sheet with sample and optional group columns")
    parser.add_argument("--out-dir", required=True, help="Directory for PNG, PDF, SVG, and TSV outputs")
    parser.add_argument("--transform", choices=["none", "log2"], default="none")
    parser.add_argument("--scale", choices=["center", "zscore", "none"], default="center")
    parser.add_argument("--gene-column", default="", help="Gene id column; default is a known alias or column 1")
    parser.add_argument("--sample-column", default="", help="Metadata sample id column; default sample/sample_id")
    parser.add_argument("--group-column", default="", help="Metadata group column; default group/condition")
    args = parser.parse_args(argv)
    try:
        run_pca(
            matrix=Path(args.matrix),
            metadata=Path(args.metadata),
            out_dir=Path(args.out_dir),
            transform=args.transform,
            scale=args.scale,
            gene_column=args.gene_column,
            sample_column=args.sample_column,
            group_column=args.group_column,
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
