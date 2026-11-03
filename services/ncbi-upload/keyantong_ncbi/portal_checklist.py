"""Checklist-driven Submission Portal state machine (no browser automation).

Honest scope: we do NOT drive NCBI Submission Portal with Playwright/Selenium
in-repo. This module only tracks the human/manual steps and validates that
local ascp prerequisites are done before marking each step complete.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


STEPS = [
    ("validate", "字段与文件清单校验通过"),
    ("dry_run", "本机 ascp dry-run 成功（路径/文件存在）"),
    ("ascp_upload", "本机 ascp 实际上传成功（可选）"),
    ("portal_login", "用户已在浏览器登录 Submission Portal"),
    ("bioproject", "用户已创建/选择 BioProject"),
    ("biosample", "用户已创建 BioSample 并粘贴校验字段"),
    ("sra_submit", "用户已创建 SRA submission 并关联文件"),
    ("accessions", "用户已保存 Accession"),
]


@dataclass
class ChecklistState:
    steps: dict[str, bool] = field(default_factory=dict)
    notes: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for key, _ in STEPS:
            self.steps.setdefault(key, False)

    def mark(self, key: str, done: bool = True, note: str = "") -> None:
        if key not in dict(STEPS):
            raise KeyError(f"unknown step {key}")
        self.steps[key] = done
        if note:
            self.notes[key] = note

    def apply_runner_status(self, status: dict[str, Any]) -> None:
        st = str(status.get("status") or "")
        if status.get("command") or st in {"dry_run", "succeeded", "running"}:
            self.mark("validate", True, "from runner")
        if st == "dry_run" and status.get("ok"):
            self.mark("dry_run", True, status.get("message") or "dry_run ok")
        if st == "succeeded" and status.get("ok"):
            self.mark("dry_run", True)
            self.mark("ascp_upload", True, status.get("message") or "ascp ok")

    def to_dict(self) -> dict[str, Any]:
        return {
            "automation_policy": "no_browser_automation",
            "steps": [{"id": k, "label": lab, "done": bool(self.steps.get(k))} for k, lab in STEPS],
            "notes": dict(self.notes),
            "next": next((k for k, lab in STEPS if not self.steps.get(k)), None),
        }


def checklist_from_status(status: dict[str, Any] | None = None) -> dict[str, Any]:
    state = ChecklistState()
    if status:
        state.apply_runner_status(status)
    return state.to_dict()
