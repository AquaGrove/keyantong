"""Validate BioSample + SRA tables and prepare an ascp command. Does not upload."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from rnaseq_viz.table_io import UserInputError, read_table

SRA_REQUIRED = [
    "sample_name",
    "library_strategy",
    "library_source",
    "library_selection",
    "library_layout",
    "platform",
    "instrument_model",
    "filename",
]
BIOSAMPLE_REQUIRED = ["sample_name", "organism"]
BIOSAMPLE_CONTEXT = ["tissue", "cell_type", "cell_line", "isolation_source", "host", "body_site"]
_NAME = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
_FASTQ = re.compile(r".+\.(fastq|fq)\.(gz|bz2)$", re.IGNORECASE)


def _norm(name: str) -> str:
    return re.sub(r"[\s\-]+", "_", name.strip().lower())


def _index(header: list[str]) -> dict[str, int]:
    return {_norm(name): i for i, name in enumerate(header)}


def _need(idx: dict[str, int], columns: list[str], label: str) -> None:
    missing = [col for col in columns if col not in idx]
    if missing:
        raise UserInputError(f"{label} 缺少列: {', '.join(missing)}")


def _rows(header: list[str], body: list[list[str]]) -> list[dict[str, str]]:
    idx = _index(header)
    out = []
    for row in body:
        out.append({key: row[i].strip() for key, i in idx.items()})
    return out


def prepare(
    biosample: Path,
    sra: Path,
    email: str,
    account: str,
    preload: str,
    key_path: str = "",
    data_dir: str = "",
) -> dict:
    bio_header, bio_body = read_table(biosample)
    sra_header, sra_body = read_table(sra)
    bio_idx = _index(bio_header)
    sra_idx = _index(sra_header)
    _need(bio_idx, BIOSAMPLE_REQUIRED, "BioSample")
    if not any(col in bio_idx for col in BIOSAMPLE_CONTEXT):
        raise UserInputError(
            "BioSample 需要至少一列生物学来源（tissue、cell_type、cell_line、isolation_source、host、body_site 之一）"
        )
    _need(sra_idx, SRA_REQUIRED, "SRA metadata")
    bio_rows = _rows(bio_header, bio_body)
    sra_rows = _rows(sra_header, sra_body)
    if not bio_rows or not sra_rows:
        raise UserInputError("BioSample 和 SRA metadata 都需要至少一行")

    bio_names: dict[str, int] = {}
    for n, row in enumerate(bio_rows, start=2):
        name = row.get("sample_name", "")
        organism = row.get("organism", "")
        if not name or not organism:
            raise UserInputError(f"BioSample 第 {n} 行 sample_name 或 organism 为空")
        if name in bio_names:
            raise UserInputError(f"BioSample 样本名重复: {name}")
        bio_names[name] = n

    filenames: list[str] = []
    paired = "filename2" in sra_idx
    for n, row in enumerate(sra_rows, start=2):
        sample = row.get("sample_name", "")
        if sample not in bio_names:
            raise UserInputError(f"SRA 第 {n} 行的 sample_name 不在 BioSample 中: {sample}")
        for col in SRA_REQUIRED:
            if not row.get(col, ""):
                raise UserInputError(f"SRA 第 {n} 行 {col} 为空")
        layout = row["library_layout"].lower()
        if layout not in {"single", "paired"}:
            raise UserInputError(f"SRA 第 {n} 行 library_layout 只能是 single 或 paired")
        files = [row["filename"]]
        if layout == "paired":
            mate = row.get("filename2", "")
            if not mate:
                raise UserInputError(f"SRA 第 {n} 行是 paired，但没有 filename2")
            files.append(mate)
        for name in files:
            if name.lower().endswith(".zip"):
                raise UserInputError(f"不要使用 zip，请改为 gzip 或 bzip2: {name}")
            if not _FASTQ.match(name):
                raise UserInputError(f"文件名需要是 .fastq.gz / .fq.gz / .fastq.bz2: {name}")
            if name in filenames:
                raise UserInputError(f"文件名重复: {name}")
            filenames.append(name)

    if not _NAME.match(account):
        raise UserInputError("account 只能包含字母、数字、点、下划线和短横线")
    if not _NAME.match(preload):
        raise UserInputError("preload 文件夹名只能包含字母、数字、点、下划线和短横线")
    if "@" not in email or email.startswith("@") or " " in email:
        raise UserInputError("submitter email 格式不对")

    key = key_path.strip() or "<path/to/key_file>"
    folder = data_dir.strip() or "<path/to/folder>"
    command = (
        f"ascp -i {key} -QT -l100m -k1 -d {folder} {email}:uploads/{account}/{preload}"
    )
    script = (
        "#!/bin/sh\n"
        "# Generated for the submitter's own machine. KeyanTong does not run this.\n"
        f"exec {command}\n"
    )
    return {
        "ok": True,
        "samples": len(sra_rows),
        "files": filenames,
        "ascp_command": command,
        "script": script,
        "stored_secrets": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="rnaseq-viz ncbi", description="Validate SRA templates and prepare ascp.")
    parser.add_argument("--biosample", required=True)
    parser.add_argument("--sra", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--account", required=True)
    parser.add_argument("--preload", required=True)
    parser.add_argument("--key-path", default="")
    parser.add_argument("--data-dir", default="")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--execute", action="store_true", help="Run ascp locally if it is on PATH. Portal must not set this.")
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Write a validation report without email, key path, or ascp command.",
    )
    args = parser.parse_args(argv)
    try:
        result = prepare(
            Path(args.biosample),
            Path(args.sra),
            args.email,
            args.account,
            args.preload,
            args.key_path,
            args.data_dir,
        )
    except UserInputError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if args.report_only:
        report = {"ok": True, "samples": result["samples"], "files": result["files"]}
        (out / "ncbi_validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, ensure_ascii=False))
        return 0
    # Local CLI may write the script because it runs on the submitter machine.
    safe = {k: v for k, v in result.items() if k != "script"}
    (out / "ncbi_plan.json").write_text(json.dumps(safe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "upload.sh").write_text(result["script"], encoding="utf-8")
    if args.execute:
        import shutil
        import subprocess

        ascp = shutil.which("ascp")
        if not ascp:
            print("本机没有 ascp，已写好 upload.sh，未执行上传", file=sys.stderr)
            return 2
        if not args.key_path or not args.data_dir:
            print("执行上传需要同时提供 --key-path 和 --data-dir", file=sys.stderr)
            return 2
        completed = subprocess.run([ascp, *result["ascp_command"].split()[1:]], check=False)
        return completed.returncode
    print(json.dumps({"ok": True, "files": len(result["files"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
