"""Analysis config: multi-group cards, colors, thresholds, Venn modes."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from .io import CONTROL_ALIASES, TREATMENT_ALIASES, load_groups

Role = Literal["control", "treatment", "custom"]

DEFAULT_PALETTE = [
    "#0f766e",
    "#b45309",
    "#7c3aed",
    "#be185d",
    "#0369a1",
    "#ca8a04",
    "#15803d",
    "#c2410c",
    "#4f46e5",
    "#0d9488",
]

VENN_MODES = (
    "up_down_per_contrast",  # up vs down within each contrast
    "multi_group_up",  # intersection of up sets across contrasts
    "multi_group_down",
    "multi_group_deg",  # significant (up∪down) across contrasts
)


@dataclass
class GroupDef:
    id: str
    name: str
    role: Role
    color: str
    samples: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class VennOptions:
    modes: list[str] = field(
        default_factory=lambda: [
            "up_down_per_contrast",
            "multi_group_up",
            "multi_group_down",
            "multi_group_deg",
        ]
    )
    contrasts: list[str] | None = None  # None = all auto contrasts
    colors: dict[str, str] = field(
        default_factory=lambda: {"up": "#b91c1c", "down": "#1d4ed8"}
    )


@dataclass
class PlotOptions:
    pca: bool = True
    volcano: bool = True
    heatmap: bool = True
    venn: bool = True


@dataclass
class AnalysisConfig:
    groups: list[GroupDef]
    species: str = "none"
    lfc: float = 1.0
    padj: float = 0.05
    plots: PlotOptions = field(default_factory=PlotOptions)
    venn: VennOptions = field(default_factory=VennOptions)
    contrasts: list[dict[str, str]] | None = None  # [{id, treatment, control}]

    def sample_to_group(self) -> dict[str, GroupDef]:
        out: dict[str, GroupDef] = {}
        for g in self.groups:
            for s in g.samples:
                if s in out:
                    raise ValueError(f"样本 {s} 被分配到多个分组")
                out[s] = g
        return out

    def primary_control(self) -> GroupDef:
        controls = [g for g in self.groups if g.role == "control"]
        if not controls:
            raise ValueError("至少需要一个 role=control 的分组")
        return controls[0]

    def auto_contrasts(self) -> list[dict[str, str]]:
        if self.contrasts:
            return self.contrasts
        ctrl = self.primary_control()
        out = []
        for g in self.groups:
            if g.id == ctrl.id:
                continue
            if g.role in ("treatment", "custom") or g.role == "control":
                # secondary controls can also be contrasted if marked treatment/custom;
                # only treatment/custom by default
                if g.role == "control":
                    continue
                cid = f"{g.name}_vs_{ctrl.name}"
                out.append({"id": cid, "treatment": g.id, "control": ctrl.id, "label": cid})
        if not out:
            raise ValueError("除对照外至少需要一个实验/自定义分组")
        return out

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": 1,
            "groups": [g.to_dict() for g in self.groups],
            "options": {
                "species": self.species,
                "lfc": self.lfc,
                "padj": self.padj,
                "plots": asdict(self.plots),
                "venn": {
                    "modes": list(self.venn.modes),
                    "contrasts": self.venn.contrasts,
                    "colors": dict(self.venn.colors),
                },
                "contrasts": self.contrasts,
            },
        }

    def write_json(self, path: Path) -> None:
        path.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    def write_sample_sheet_csv(self, path: Path) -> None:
        rows = []
        for g in self.groups:
            for s in g.samples:
                rows.append(
                    {
                        "sample": s,
                        "group": g.name,
                        "group_id": g.id,
                        "role": g.role,
                        "color": g.color,
                    }
                )
        pd.DataFrame(rows).to_csv(path, index=False)


def _guess_role(name: str) -> Role:
    low = name.lower().strip()
    if low in CONTROL_ALIASES or any(a in low for a in ("control", "ctrl", "对照")):
        return "control"
    if low in TREATMENT_ALIASES or any(a in low for a in ("treat", "exp", "实验", "处理", "oe", "rnai")):
        return "treatment"
    return "custom"


def config_from_groups_csv(path: Path, species: str = "none", lfc: float = 1.0, padj: float = 0.05) -> AnalysisConfig:
    raw = load_groups(path)
    # preserve order of first appearance
    names: list[str] = list(dict.fromkeys(raw["group"].tolist()))
    groups: list[GroupDef] = []
    for i, name in enumerate(names):
        samples = raw.index[raw["group"] == name].tolist()
        role = _guess_role(name)
        # if only two unlabeled groups, force first→control second→treatment when neither matched
        groups.append(
            GroupDef(
                id=f"g{i+1}",
                name=str(name),
                role=role,
                color=DEFAULT_PALETTE[i % len(DEFAULT_PALETTE)],
                samples=[str(s) for s in samples],
            )
        )
    roles = {g.role for g in groups}
    if "control" not in roles and len(groups) >= 1:
        groups[0].role = "control"
    if "treatment" not in roles and len(groups) >= 2:
        for g in groups[1:]:
            if g.role != "control":
                g.role = "treatment"
                break
        else:
            groups[1].role = "treatment"
    return AnalysisConfig(groups=groups, species=species, lfc=lfc, padj=padj)


def config_from_dict(data: dict[str, Any]) -> AnalysisConfig:
    if "groups" not in data:
        raise ValueError("配置缺少 groups")
    groups = []
    for i, g in enumerate(data["groups"]):
        role = str(g.get("role") or "custom")
        if role not in ("control", "treatment", "custom"):
            role = "custom"
        groups.append(
            GroupDef(
                id=str(g.get("id") or f"g{i+1}"),
                name=str(g.get("name") or g.get("id") or f"组{i+1}"),
                role=role,  # type: ignore[arg-type]
                color=str(g.get("color") or DEFAULT_PALETTE[i % len(DEFAULT_PALETTE)]),
                samples=[str(s) for s in (g.get("samples") or g.get("sampleIds") or [])],
            )
        )
    opts = data.get("options") or {}
    # allow flat keys at top level too
    species = str(opts.get("species") or data.get("species") or "none")
    lfc = float(opts.get("lfc") or opts.get("abs_log2FC") or data.get("lfc") or 1.0)
    padj = float(opts.get("padj") or data.get("padj") or 0.05)
    plots_raw = opts.get("plots") or {}
    plots = PlotOptions(
        pca=bool(plots_raw.get("pca", True)),
        volcano=bool(plots_raw.get("volcano", True)),
        heatmap=bool(plots_raw.get("heatmap", True)),
        venn=bool(plots_raw.get("venn", True)),
    )
    venn_raw = opts.get("venn") or {}
    modes = venn_raw.get("modes") or list(VENN_MODES)
    modes = [m for m in modes if m in VENN_MODES]
    if not modes:
        modes = list(VENN_MODES)
    venn = VennOptions(
        modes=modes,
        contrasts=venn_raw.get("contrasts"),
        colors={**{"up": "#b91c1c", "down": "#1d4ed8"}, **(venn_raw.get("colors") or {})},
    )
    contrasts = opts.get("contrasts") or data.get("contrasts")
    return AnalysisConfig(
        groups=groups,
        species=species,
        lfc=lfc,
        padj=padj,
        plots=plots,
        venn=venn,
        contrasts=contrasts,
    )


def load_analysis_config(
    path: Path,
    *,
    species: str | None = None,
    lfc: float | None = None,
    padj: float | None = None,
) -> AnalysisConfig:
    """Load either JSON analysis config or legacy sample,group CSV."""
    path = Path(path)
    text = path.read_text(encoding="utf-8", errors="replace").lstrip()
    if path.suffix.lower() == ".json" or text.startswith("{") or text.startswith("["):
        data = json.loads(text)
        if isinstance(data, list):
            data = {"groups": data}
        cfg = config_from_dict(data)
    else:
        cfg = config_from_groups_csv(path)
    if species is not None:
        cfg.species = species
    if lfc is not None:
        cfg.lfc = lfc
    if padj is not None:
        cfg.padj = padj
    _validate(cfg)
    return cfg


def _validate(cfg: AnalysisConfig) -> None:
    if not cfg.groups:
        raise ValueError("至少需要一个分组")
    assigned = cfg.sample_to_group()
    if len(assigned) < 4:
        raise ValueError("已分配样本不足 4 个")
    controls = [g for g in cfg.groups if g.role == "control"]
    if not controls:
        raise ValueError("至少需要一个对照分组 (role=control)")
    for g in cfg.groups:
        if len(g.samples) < 2 and g.role in ("control", "treatment"):
            raise ValueError(f"分组「{g.name}」至少需要 2 个样本（当前 {len(g.samples)}）")
    cfg.auto_contrasts()  # ensure at least one
