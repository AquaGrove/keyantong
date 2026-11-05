"""Validate NCBI SRA necessary-info payloads and build ascp commands."""
from __future__ import annotations

import re
import shlex
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


REQUIRED_BIOPROJECT = ("title", "description", "data_type")
REQUIRED_BIOSAMPLE = ("sample_name", "organism", "isolate_or_breed", "collection_date")
REQUIRED_LIBRARY = ("library_strategy", "library_source", "library_selection", "library_layout")
REQUIRED_FILES = ("filename",)


FASTQ_RE = re.compile(r"(?i).+\.(fastq|fq)(\.gz)?$")
PAIR_RE = re.compile(r"(?i)([_\.-])(R?[12]|R?[12]_001)([_\.-]|\.)")


@dataclass
class ValidationIssue:
    level: str  # error | warning
    field: str
    message: str


@dataclass
class ValidationResult:
    ok: bool
    issues: list[ValidationIssue] = field(default_factory=list)
    normalized: dict[str, Any] = field(default_factory=dict)
    ascp_command: str | None = None
    checklist: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "issues": [{"level": i.level, "field": i.field, "message": i.message} for i in self.issues],
            "normalized": self.normalized,
            "ascp_command": self.ascp_command,
            "checklist": self.checklist,
        }


def _missing(obj: dict[str, Any], keys: tuple[str, ...], prefix: str) -> list[ValidationIssue]:
    out = []
    for k in keys:
        v = obj.get(k)
        if v is None or str(v).strip() == "":
            out.append(ValidationIssue("error", f"{prefix}.{k}", f"缺少必填项：{k}"))
    return out


def reconcile_filenames(files: list[dict[str, Any]], layout: str) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    names = []
    for i, f in enumerate(files):
        name = str(f.get("filename") or "").strip()
        if not name:
            issues.append(ValidationIssue("error", f"files[{i}].filename", "文件名不能为空"))
            continue
        if name in {".", ".."} or "/" in name or "\\" in name or name.startswith("-") or any(ord(c) < 32 for c in name):
            issues.append(ValidationIssue("error", f"files[{i}].filename", "文件名只能是当前目录中的单个文件名"))
        names.append(name)
        if not FASTQ_RE.match(name) and not name.lower().endswith((".bam", ".cram", ".hdf5", ".fast5")):
            issues.append(
                ValidationIssue(
                    "warning",
                    f"files[{i}].filename",
                    "扩展名非常见测序格式；请确认 Submission Portal 接受该类型",
                )
            )
    if layout.lower() == "paired":
        # expect even count and R1/R2 style pairing when possible
        if len(names) % 2 != 0:
            issues.append(ValidationIssue("error", "files", "paired 布局下文件数应为偶数"))
        stems = {}
        for n in names:
            m = PAIR_RE.search(n)
            if not m:
                issues.append(
                    ValidationIssue(
                        "warning",
                        "files",
                        f"无法从文件名识别 R1/R2 配对标记：{n}",
                    )
                )
                continue
            stem = PAIR_RE.sub(r"\1{mate}\3", n)
            mate = m.group(2).upper().replace("_001", "")
            stems.setdefault(stem, set()).add(mate)
        for stem, mates in stems.items():
            if mates and not ({"1", "2"} <= {m[-1] for m in mates} or {"R1", "R2"} <= mates):
                # soft check
                if len(mates) == 1:
                    issues.append(
                        ValidationIssue("warning", "files", f"疑似缺配对端：pattern={stem} mates={sorted(mates)}")
                    )
    # duplicate names
    seen = set()
    for n in names:
        if n in seen:
            issues.append(ValidationIssue("error", "files", f"重复文件名：{n}"))
        seen.add(n)
    return issues


def build_ascp_command(
    *,
    key_path: str,
    local_folder: str,
    ncbi_user_email: str,
    account_folder: str,
    rate: str = "100m",
) -> tuple[str | None, list[ValidationIssue]]:
    issues: list[ValidationIssue] = []
    if not key_path or not str(key_path).strip():
        issues.append(ValidationIssue("error", "ascp.key_path", "需要本机 Aspera 私钥绝对路径（不会上传到服务器）"))
    else:
        kp = Path(key_path)
        if not kp.is_absolute():
            # Path.is_absolute handles POSIX and Windows when running on that OS;
            # also accept explicit Windows drive / UNC strings when validating cross-platform.
            s = str(key_path)
            win = len(s) >= 3 and s[1] == ":" and s[2] in "\\/" or s.startswith("\\")
            if not win:
                issues.append(ValidationIssue("error", "ascp.key_path", "密钥路径必须是绝对路径（POSIX 或 Windows）"))
    if not local_folder or not str(local_folder).strip():
        issues.append(ValidationIssue("error", "ascp.local_folder", "需要本地待上传文件夹路径"))
    if ncbi_user_email and "@" not in ncbi_user_email:
        issues.append(
            ValidationIssue(
                "warning",
                "ascp.ncbi_user_email",
                "NCBI 账户邮箱格式异常（仅作账号标识；ascp 远程用户固定为 subasp@upload.ncbi.nlm.nih.gov）",
            )
        )
    elif not ncbi_user_email:
        issues.append(
            ValidationIssue(
                "warning",
                "ascp.ncbi_user_email",
                "建议填写 NCBI 账户邮箱作备忘；ascp 远程用户固定为 subasp@upload.ncbi.nlm.nih.gov",
            )
        )
    if not account_folder or not str(account_folder).strip():
        issues.append(ValidationIssue("error", "ascp.account_folder", "需要 NCBI 分配的 uploads 子目录名"))
    if account_folder and not re.fullmatch(r"[A-Za-z0-9_@.-]+", account_folder):
        issues.append(ValidationIssue("error", "ascp.account_folder", "账户目录只能是 NCBI 分配的单个目录名"))
    if account_folder in {".", ".."}:
        issues.append(ValidationIssue("error", "ascp.account_folder", "账户目录无效"))
    if not re.fullmatch(r"[1-9][0-9]{0,5}[kKmMgG]", rate):
        issues.append(ValidationIssue("error", "ascp.rate", "速率应为 100m 等正整数单位值"))
    if any(i.level == "error" for i in issues):
        return None, issues
    # Never embed key content — only the path placeholder the user already provided locally.
    # Remote user is ALWAYS subasp@upload.ncbi.nlm.nih.gov (not the account email).
    cmd = shlex.join(["ascp", "-i", key_path, "-QT", f"-l{rate}", "-k1", "-d", local_folder, f"subasp@upload.ncbi.nlm.nih.gov:uploads/{account_folder}"])
    return cmd, issues


def validate_submission(payload: dict[str, Any]) -> ValidationResult:
    issues: list[ValidationIssue] = []
    bioproject = dict(payload.get("bioproject") or {})
    biosample = dict(payload.get("biosample") or {})
    library = dict(payload.get("library") or {})
    files = list(payload.get("files") or [])
    ascp = dict(payload.get("ascp") or {})

    issues += _missing(bioproject, REQUIRED_BIOPROJECT, "bioproject")
    issues += _missing(biosample, REQUIRED_BIOSAMPLE, "biosample")
    issues += _missing(library, REQUIRED_LIBRARY, "library")
    if not files:
        issues.append(ValidationIssue("error", "files", "至少提供一个数据文件名"))
    else:
        for i, f in enumerate(files):
            issues += _missing(dict(f), REQUIRED_FILES, f"files[{i}]")
        issues += reconcile_filenames(files, str(library.get("library_layout") or "paired"))

    cmd, ascp_issues = build_ascp_command(
        key_path=str(ascp.get("key_path") or ""),
        local_folder=str(ascp.get("local_folder") or ""),
        ncbi_user_email=str(ascp.get("ncbi_user_email") or ""),
        account_folder=str(ascp.get("account_folder") or ""),
        rate=str(ascp.get("rate") or "100m"),
    )
    issues += ascp_issues

    checklist = [
        "在 NCBI Submission Portal 创建/选择 BioProject",
        "按校验后的字段填写 BioSample 属性",
        "上传 SRA metadata 表（文件名与本地一致）",
        "本机安装 IBM Aspera Connect / ascp",
        "使用下方生成的 ascp 命令上传（私钥仅留在本机）",
        "在 Portal 核对 MD5 / 文件清单后提交",
    ]

    normalized = {
        "bioproject": bioproject,
        "biosample": biosample,
        "library": library,
        "files": files,
        "ascp": {
            "key_path": ascp.get("key_path"),
            "local_folder": ascp.get("local_folder"),
            "ncbi_user_email": ascp.get("ncbi_user_email"),
            "account_folder": ascp.get("account_folder"),
            "rate": ascp.get("rate") or "100m",
            # deliberately no key material
        },
    }
    ok = not any(i.level == "error" for i in issues)
    return ValidationResult(ok=ok, issues=issues, normalized=normalized, ascp_command=cmd if ok else None, checklist=checklist)
