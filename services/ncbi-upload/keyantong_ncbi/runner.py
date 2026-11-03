"""Optional local ascp runner: dry-run or execute with progress log + status JSON.

Security: never reads/embeds/logs private key *contents* — only the absolute path
the user already has on the same machine. Intended for local-mode portal where
the Next.js process and FASTQ files share one host.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .validators import ValidationIssue, build_ascp_command, validate_submission
from .portal_checklist import checklist_from_status


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _redact(cmd: str, key_path: str) -> str:
    """Keep path visible but never expand key file contents into logs."""
    return cmd


@dataclass
class RunStatus:
    status: str  # queued|dry_run|running|succeeded|failed|skipped
    ok: bool
    dry_run: bool
    command: str | None = None
    ascp_path: str | None = None
    log_path: str | None = None
    status_path: str | None = None
    exit_code: int | None = None
    message: str = ""
    started_at: str | None = None
    finished_at: str | None = None
    issues: list[dict[str, str]] = field(default_factory=list)
    validation: dict[str, Any] | None = None
    portal_checklist: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        if self.portal_checklist is None:
            self.portal_checklist = checklist_from_status(self.to_dict())
        path.write_text(json.dumps(self.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


def find_ascp(explicit: str | None = None) -> str | None:
    if explicit:
        p = Path(explicit)
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
    found = shutil.which("ascp")
    if found:
        return found
    # common Aspera Connect locations (macOS / Linux)
    candidates = [
        Path.home() / "Applications/Aspera Connect.app/Contents/Resources/ascp",
        Path("/Applications/Aspera Connect.app/Contents/Resources/ascp"),
        Path("/usr/local/bin/ascp"),
        Path("/usr/bin/ascp"),
    ]
    for c in candidates:
        if c.is_file() and os.access(c, os.X_OK):
            return str(c)
    return None


def prepare_and_run(
    payload: dict[str, Any],
    *,
    outdir: Path,
    dry_run: bool = True,
    ascp_bin: str | None = None,
    timeout_sec: int | None = None,
) -> RunStatus:
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    log_path = outdir / "ascp_progress.log"
    status_path = outdir / "status.json"

    validation = validate_submission(payload)
    ascp = dict(payload.get("ascp") or {})
    key_path = str(ascp.get("key_path") or "")
    local_folder = str(ascp.get("local_folder") or "")

    issues = [{"level": i.level, "field": i.field, "message": i.message} for i in validation.issues]

    # Extra local filesystem checks (paths only)
    if key_path:
        kp = Path(key_path)
        if not kp.is_file():
            issues.append({"level": "error", "field": "ascp.key_path", "message": f"密钥文件不存在: {key_path}"})
        else:
            # refuse to open/read key contents — existence + mode check only
            mode = kp.stat().st_mode & 0o777
            if mode & 0o077:
                issues.append(
                    {
                        "level": "warning",
                        "field": "ascp.key_path",
                        "message": f"密钥文件权限过宽 ({oct(mode)})，建议 chmod 600",
                    }
                )
    if local_folder:
        lf = Path(local_folder)
        if not lf.is_dir():
            issues.append({"level": "error", "field": "ascp.local_folder", "message": f"本地目录不存在: {local_folder}"})
        else:
            # reconcile filenames if provided
            names = [str(f.get("filename") or "") for f in (payload.get("files") or [])]
            missing = [n for n in names if n and not (lf / n).exists()]
            if missing:
                issues.append(
                    {
                        "level": "error",
                        "field": "files",
                        "message": f"本地目录缺少文件: {', '.join(missing[:8])}"
                        + ("…" if len(missing) > 8 else ""),
                    }
                )

    has_error = any(i["level"] == "error" for i in issues)
    cmd = validation.ascp_command
    binary = find_ascp(ascp_bin)

    st = RunStatus(
        status="queued",
        ok=False,
        dry_run=dry_run,
        command=cmd,
        ascp_path=binary,
        log_path=str(log_path),
        status_path=str(status_path),
        issues=issues,
        validation=validation.to_dict(),
        started_at=_now(),
        message="",
    )

    if has_error or not cmd:
        st.status = "failed"
        st.message = "校验未通过，未执行 ascp"
        st.finished_at = _now()
        st.write(status_path)
        log_path.write_text(
            f"[{_now()}] validation failed; dry_run={dry_run}\ncommand={cmd}\nissues={json.dumps(issues, ensure_ascii=False)}\n",
            encoding="utf-8",
        )
        return st

    # Rewrite command to use discovered ascp binary if present
    if binary and cmd.startswith("ascp "):
        cmd = binary + cmd[4:]
        st.command = cmd

    if dry_run:
        st.status = "dry_run"
        st.ok = True
        st.message = "dry-run：已生成命令并完成路径/文件校验，未实际上传"
        st.finished_at = _now()
        log_path.write_text(
            f"[{_now()}] DRY-RUN\n"
            f"ascp_bin={binary or 'ascp(not found — install Aspera Connect for real run)'}\n"
            f"command={_redact(cmd, key_path)}\n"
            f"key_path={key_path}\n"
            f"local_folder={local_folder}\n"
            f"(key contents never logged)\n",
            encoding="utf-8",
        )
        st.write(status_path)
        return st

    if not binary:
        st.status = "failed"
        st.message = "未找到 ascp 可执行文件；请安装 IBM Aspera Connect 或设置 ascp_bin"
        st.finished_at = _now()
        log_path.write_text(f"[{_now()}] ascp not found\ncommand={cmd}\n", encoding="utf-8")
        st.write(status_path)
        return st

    st.status = "running"
    st.write(status_path)
    with log_path.open("w", encoding="utf-8") as log:
        log.write(f"[{_now()}] START\ncommand={_redact(cmd, key_path)}\n")
        log.flush()
        try:
            proc = subprocess.Popen(
                cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env={k: v for k, v in os.environ.items()},  # no injected secrets
            )
            assert proc.stdout is not None
            start = time.time()
            for line in proc.stdout:
                # never echo key file contents; ascp itself shouldn't print them
                if "PRIVATE KEY" in line.upper() or "BEGIN OPENSSH" in line.upper():
                    log.write("[redacted potential key material]\n")
                else:
                    log.write(line)
                log.flush()
                if timeout_sec and (time.time() - start) > timeout_sec:
                    proc.kill()
                    log.write(f"\n[{_now()}] TIMEOUT after {timeout_sec}s\n")
                    st.exit_code = -1
                    st.status = "failed"
                    st.message = f"ascp 超时（{timeout_sec}s）"
                    break
            rc = proc.wait()
            st.exit_code = rc
            if st.status != "failed":
                if rc == 0:
                    st.status = "succeeded"
                    st.ok = True
                    st.message = "ascp 完成"
                else:
                    st.status = "failed"
                    st.message = f"ascp 退出码 {rc}"
            log.write(f"\n[{_now()}] END status={st.status} exit={rc}\n")
        except Exception as exc:  # noqa: BLE001
            st.status = "failed"
            st.message = f"执行失败: {exc}"
            log.write(f"\n[{_now()}] EXCEPTION {exc}\n")
    st.finished_at = _now()
    st.write(status_path)
    return st
