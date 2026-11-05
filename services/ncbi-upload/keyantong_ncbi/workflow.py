"""Resumable local-only preparation and execution. All task data stays on disk."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from .runner import prepare_and_run
from .validators import validate_submission

def home(): return Path(os.environ.get("KEYANTONG_NCBI_HOME", str(Path.home() / ".keyantong/ncbi"))).resolve()
def task_dir(task_id: str):
    if not re.fullmatch(r"[0-9a-f-]{36}", task_id): raise ValueError("任务编号无效")
    return home() / "tasks" / task_id
def write_json(dest: Path, value):
    dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = dest.with_name(dest.name + ".tmp"); tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8"); tmp.chmod(0o600); tmp.replace(dest)
def read_json(dest): return json.loads(dest.read_text(encoding="utf-8"))
def manifest(payload: dict):
    root = Path(payload["ascp"]["local_folder"]).resolve(strict=True)
    names = [f["filename"] for f in payload["files"]]; result = []
    if len(set(names)) != len(names): raise ValueError("文件名重复")
    for name in names:
        if Path(name).name != name or "/" in name or "\\" in name or name.startswith("-"): raise ValueError("文件名无效")
        file = root / name
        if file.is_symlink() or file.resolve().parent != root or not file.is_file(): raise ValueError("清单中有不存在或不允许的文件")
        before = file.stat()
        if before.st_size == 0: raise ValueError("不能上传空文件")
        md5 = hashlib.md5(usedforsecurity=False); sha = hashlib.sha256()
        with file.open("rb") as f:
            while chunk := f.read(4 * 1024 * 1024): md5.update(chunk); sha.update(chunk)
        after = file.stat()
        if before.st_size != after.st_size or before.st_mtime_ns != after.st_mtime_ns: raise ValueError("计算校验和时文件发生变化")
        result.append({"filename": name, "bytes": after.st_size, "mtime_ns": after.st_mtime_ns, "md5": md5.hexdigest(), "sha256": sha.hexdigest()})
    return result
def fingerprint(payload, files): return hashlib.sha256(json.dumps({"payload": payload, "files": files}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
def prepare(payload: dict):
    validation = validate_submission(payload)
    if not validation.ok: raise ValueError("；".join(i.message for i in validation.issues if i.level == "error"))
    task_id = str(uuid.uuid4()); directory = task_dir(task_id)
    dry = prepare_and_run(payload, outdir=directory / "preflight", dry_run=True)
    if not dry.ok: raise ValueError("；".join(i["message"] for i in dry.issues if i["level"] == "error"))
    files = manifest(payload); approval = fingerprint(payload, files)
    task = {"id": task_id, "state": "awaiting_transfer_approval", "payload": payload, "files": files, "approval": approval, "createdAt": datetime.now(timezone.utc).isoformat(), "destination": f"subasp@upload.ncbi.nlm.nih.gov:uploads/{payload['ascp']['account_folder']}/{Path(payload['ascp']['local_folder']).name}", "totalBytes": sum(f["bytes"] for f in files)}
    write_json(directory / "task.json", task)
    return {k: v for k, v in task.items() if k != "payload"}
def start(task_id: str, approval: str):
    directory = task_dir(task_id); task = read_json(directory / "task.json")
    if task["approval"] != approval: raise ValueError("传输确认已失效，请重新核对任务")
    if task["state"] not in {"awaiting_transfer_approval", "transfer_failed"}: raise ValueError("任务不处于可启动状态")
    # O_EXCL prevents two clicks or two native host processes starting the same task.
    lock = directory / "running.lock"
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600); os.close(fd)
    try:
        log = (directory / "worker.log").open("ab")
        kwargs = {"start_new_session": True} if os.name != "nt" else {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS}
        if getattr(sys, "frozen", False):
            command = [sys.executable, "--workflow", "--execute", task_id, "--approval", approval]
        elif sys.argv[0].endswith(".pyz"):
            command = [sys.executable, sys.argv[0], "--workflow", "--execute", task_id, "--approval", approval]
        else:
            command = [sys.executable, "-m", "keyantong_ncbi.workflow", "--execute", task_id, "--approval", approval]
        proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=log, **kwargs)
        log.close(); return {"id": task_id, "state": "starting", "pid": proc.pid}
    except Exception:
        lock.unlink(missing_ok=True); raise

def execute(task_id: str, approval: str):
    directory = task_dir(task_id); task = read_json(directory / "task.json")
    try:
        files = manifest(task["payload"])
        if fingerprint(task["payload"], files) != approval or approval != task["approval"]: raise ValueError("文件、元数据或目标已变化，请重新创建并确认传输计划")
        task["state"] = "transferring"; write_json(directory / "task.json", task)
        status = prepare_and_run(task["payload"], outdir=directory / "transfer", dry_run=False, timeout_sec=7 * 24 * 3600)
        task["state"] = "awaiting_ncbi_files" if status.ok else "transfer_failed"; task["message"] = status.message
        if status.ok and manifest(task["payload"]) != files:
            task["state"] = "transfer_failed"; task["message"] = "传输期间本地文件变化，需要重新核对"
        task["transferFinishedAt"] = datetime.now(timezone.utc).isoformat()
        write_json(directory / "task.json", task)
    except Exception as e:
        task["state"] = "transfer_failed"; task["message"] = str(e); write_json(directory / "task.json", task)
    finally: (directory / "running.lock").unlink(missing_ok=True)

def status(task_id: str):
    task = read_json(task_dir(task_id) / "task.json")
    return {k: v for k, v in task.items() if k not in {"payload", "approval"}}

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--execute"); parser.add_argument("--approval"); args = parser.parse_args()
    if not args.execute or not args.approval: parser.error("internal execution requires task id and approval fingerprint")
    execute(args.execute, args.approval)
if __name__ == "__main__": main()
