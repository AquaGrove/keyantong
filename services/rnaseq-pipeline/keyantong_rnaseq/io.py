"""Load expression matrix and sample groups."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

CONTROL_ALIASES = {"control", "ctrl", "con", "wt", "wildtype", "wild-type", "对照", "对照组"}
TREATMENT_ALIASES = {"treatment", "treat", "case", "exp", "experimental", "koe", "oe", "rnai", "处理", "实验", "实验组"}


def _read_table(path: Path) -> pd.DataFrame:
    sep = "\t" if path.suffix.lower() in {".tsv", ".txt"} else ","
    df = pd.read_csv(path, sep=sep)
    if df.shape[1] < 2:
        # retry opposite delimiter
        other = "\t" if sep == "," else ","
        df = pd.read_csv(path, sep=other)
    return df


def load_matrix(path: Path) -> pd.DataFrame:
    df = _read_table(path)
    gene_col = df.columns[0]
    df = df.rename(columns={gene_col: "gene_id"})
    df["gene_id"] = df["gene_id"].astype(str)
    df = df.drop_duplicates(subset=["gene_id"], keep="first")
    df = df.set_index("gene_id")
    # coerce numeric
    for c in df.columns:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(axis=0, how="all")
    if df.empty:
        raise ValueError("表达矩阵没有可用的数值列")
    return df


def load_groups(path: Path) -> pd.DataFrame:
    df = _read_table(path)
    cols = {c.lower().strip(): c for c in df.columns}
    sample_key = next((cols[k] for k in ("sample", "sample_id", "sampleid", "id", "样本") if k in cols), None)
    group_key = next((cols[k] for k in ("group", "condition", "class", "分组", "组别") if k in cols), None)
    if sample_key is None or group_key is None:
        if df.shape[1] >= 2:
            sample_key, group_key = df.columns[0], df.columns[1]
        else:
            raise ValueError("分组表需要 sample 与 group 两列")
    out = df[[sample_key, group_key]].copy()
    out.columns = ["sample", "group"]
    out["sample"] = out["sample"].astype(str).str.strip()
    out["group"] = out["group"].astype(str).str.strip()
    out = out.dropna()
    if out["sample"].duplicated().any():
        raise ValueError("分组表存在重复样本名")
    return out.set_index("sample")


def normalize_contrast(groups: pd.Series) -> tuple[str, str, pd.Series]:
    """Return (control_label, treatment_label, mapped series with those labels)."""
    uniq = list(dict.fromkeys(groups.tolist()))
    if len(uniq) != 2:
        raise ValueError(f"当前一键分析仅支持两组比较，收到: {uniq}")
    lower_map = {g: g.lower() for g in uniq}
    control = None
    treatment = None
    for g, low in lower_map.items():
        if low in CONTROL_ALIASES or any(a in low for a in ("control", "ctrl", "对照")):
            control = g
        if low in TREATMENT_ALIASES or any(a in low for a in ("treat", "exp", "实验", "处理", "oe", "rnai")):
            treatment = g
    if control is None and treatment is None:
        control, treatment = uniq[0], uniq[1]
    elif control is None:
        control = next(g for g in uniq if g != treatment)
    elif treatment is None:
        treatment = next(g for g in uniq if g != control)
    if control == treatment:
        raise ValueError("无法区分对照与实验组")
    mapped = groups.map(lambda g: "control" if g == control else "treatment")
    return control, treatment, mapped
