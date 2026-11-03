"""Read expression matrices and sample sheets. Delimiter is sniffed; paths are caller-supplied."""

from __future__ import annotations

import csv
import re
from pathlib import Path

GENE_ALIASES = {"gene_id", "geneid", "gene", "id", "gene_name", "genename"}
SAMPLE_ALIASES = {"sample", "sample_id", "sampleid", "sample_name", "samplename"}
GROUP_ALIASES = {"group", "condition", "subgroup", "treatment"}

MAX_SAMPLES = 80
MAX_GENES = 50000


class UserInputError(Exception):
    """Bad table or arguments. Safe to show to the person who uploaded the file."""


def _norm(name: str) -> str:
    return re.sub(r"[\s\-]+", "_", name.strip().lower())


def read_table(path: Path) -> tuple[list[str], list[list[str]]]:
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise UserInputError(f"无法读取文件: {path.name}") from exc
    if "\0" in text:
        raise UserInputError(f"{path.name} 不是文本表格")
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        lines.append(line)
    if not lines:
        raise UserInputError(f"{path.name} 是空的")
    header_line = lines[0]
    tabs = header_line.count("\t")
    commas = header_line.count(",")
    delim = "\t" if tabs > 0 and tabs >= commas else ","
    rows = list(csv.reader(lines, delimiter=delim))
    if not rows:
        raise UserInputError(f"{path.name} 是空的")
    header = [cell.strip() for cell in rows[0]]
    if not any(header):
        raise UserInputError(f"{path.name} 缺少表头")
    if len(set(header)) != len(header):
        raise UserInputError(f"{path.name} 表头有重复列名")
    body = [[cell.strip() for cell in row] for row in rows[1:] if any(cell.strip() for cell in row)]
    width = len(header)
    for i, row in enumerate(body, start=2):
        if len(row) != width:
            raise UserInputError(f"{path.name} 第 {i} 行列数与表头不一致")
    return header, body


def _find_column(header: list[str], explicit: str, aliases: set[str]) -> int | None:
    if explicit:
        wanted = _norm(explicit)
        for i, name in enumerate(header):
            if _norm(name) == wanted or name == explicit:
                return i
        raise UserInputError(f"找不到列 {explicit}")
    for i, name in enumerate(header):
        if _norm(name) in aliases:
            return i
    return None


def load_expression(
    path: Path,
    gene_column: str = "",
) -> tuple[list[str], list[str], list[list[float]]]:
    header, body = read_table(path)
    gene_idx = _find_column(header, gene_column, GENE_ALIASES)
    if gene_idx is None:
        gene_idx = 0
    sample_idx = [i for i in range(len(header)) if i != gene_idx]
    if len(sample_idx) < 2:
        raise UserInputError("表达矩阵至少需要 2 个样本列")
    if len(sample_idx) > MAX_SAMPLES:
        raise UserInputError(f"样本数超过上限 {MAX_SAMPLES}")
    if len(body) < 2:
        raise UserInputError("表达矩阵至少需要 2 个基因")
    if len(body) > MAX_GENES:
        raise UserInputError(f"基因数超过上限 {MAX_GENES}")
    samples = [header[i] for i in sample_idx]
    genes: list[str] = []
    seen: set[str] = set()
    matrix: list[list[float]] = []
    for row_i, row in enumerate(body, start=2):
        gene = row[gene_idx]
        if not gene:
            raise UserInputError(f"第 {row_i} 行缺少基因 ID")
        if gene in seen:
            raise UserInputError(f"基因 ID 重复: {gene}")
        seen.add(gene)
        values: list[float] = []
        for col in sample_idx:
            raw = row[col]
            if raw == "":
                raise UserInputError(f"第 {row_i} 行样本 {header[col]} 为空")
            try:
                values.append(float(raw))
            except ValueError as exc:
                raise UserInputError(f"第 {row_i} 行样本 {header[col]} 不是数字") from exc
        genes.append(gene)
        matrix.append(values)
    # matrix is genes × samples
    return genes, samples, matrix


def load_metadata(
    path: Path,
    samples: list[str],
    sample_column: str = "",
    group_column: str = "",
) -> list[str]:
    header, body = read_table(path)
    sample_idx = _find_column(header, sample_column, SAMPLE_ALIASES)
    if sample_idx is None:
        raise UserInputError("样本表需要 sample 列（或 sample_id）")
    group_idx = _find_column(header, group_column, GROUP_ALIASES)
    groups_by_sample: dict[str, str] = {}
    for row_i, row in enumerate(body, start=2):
        sample = row[sample_idx]
        if not sample:
            raise UserInputError(f"样本表第 {row_i} 行缺少样本名")
        if sample in groups_by_sample:
            raise UserInputError(f"样本名重复: {sample}")
        group = row[group_idx].strip() if group_idx is not None else ""
        groups_by_sample[sample] = group or "ungrouped"
    missing = [s for s in samples if s not in groups_by_sample]
    extra = [s for s in groups_by_sample if s not in set(samples)]
    if missing:
        preview = "、".join(missing[:5])
        raise UserInputError(f"样本表缺少矩阵中的样本: {preview}")
    if extra:
        preview = "、".join(extra[:5])
        raise UserInputError(f"样本表有矩阵中不存在的样本: {preview}")
    return [groups_by_sample[s] for s in samples]
