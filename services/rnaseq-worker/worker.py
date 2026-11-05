#!/usr/bin/env python3
"""RNAseq worker loop — downstream DE on shared /data/rnaseq volume; upstream skeleton."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

from quota import assert_can_accept_job, max_concurrent, queue_max

DATA_ROOT = Path(os.environ.get("RNASEQ_DATA_ROOT", "/data/rnaseq"))
JOBS = DATA_ROOT / "jobs"
RESULTS = DATA_ROOT / "results"
INCOMING = DATA_ROOT / "incoming"
ANNOTATIONS = Path(os.environ.get("RNASEQ_ANNOTATIONS", "/opt/rnaseq/pipeline/annotations"))
POLL = float(os.environ.get("RNASEQ_POLL_SEC", "5"))
PIPELINE = Path(os.environ.get("RNASEQ_PIPELINE_ROOT", "/opt/rnaseq/pipeline"))


def log(msg: str) -> None:
    print(f"[rnaseq-worker] {msg}", flush=True)


def read_job(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_job(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def list_by_status(status: str) -> list[Path]:
    if not JOBS.exists():
        return []
    out: list[Path] = []
    for d in sorted(JOBS.iterdir()):
        meta = d / "job.json"
        if not meta.is_file():
            continue
        try:
            j = read_job(meta)
        except Exception:
            continue
        if j.get("status") == status:
            out.append(meta)
    return out


def zip_results(out_dir: Path, zip_path: Path) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in out_dir.rglob("*"):
            if p.is_file() and p != zip_path:
                zf.write(p, arcname=str(p.relative_to(out_dir)))


def load_summary(out_dir: Path) -> dict:
    for name in ("manifest.json", "result.json", "summary.json", "tables/methods.json"):
        p = out_dir / name
        if not p.is_file():
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                if name == "manifest.json":
                    summary = data.get("summary")
                    if isinstance(summary, dict):
                        return summary
                    continue
                if name.endswith("methods.json"):
                    return {
                        "de_engine": data.get("engine") or data.get("de_engine"),
                        "enrichment": data.get("enrichment"),
                    }
                return data
        except Exception:
            continue
    return {}


def run_downstream(job_path: Path, job: dict) -> Path:
    work = job_path.parent
    matrix = work / "input" / "matrix.csv"
    groups = work / "input" / "groups.json"
    job_id = str(job.get("id", work.name))
    out_dir = RESULTS / job_id
    if out_dir.exists():
        shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not matrix.exists() or not groups.exists():
        raise FileNotFoundError("downstream job missing input/matrix.csv or groups.json")

    # The portal historically queues every grouping file as groups.json.
    # Preserve genuine JSON designs; route tabular inputs to the table parser.
    with groups.open("rb") as stream:
        prefix = stream.read(4096).removeprefix(b"\xef\xbb\xbf").lstrip()
    if not prefix.startswith((b"{", b"[")):
        table = groups.with_suffix(".csv")
        shutil.copyfile(groups, table)
        groups = table

    # Soft quota on input size (80GiB default covers upstream; downstream matrices are tiny)
    assert_can_accept_job(DATA_ROOT, work)

    cmd = [
        sys.executable,
        "-m",
        "keyantong_rnaseq",
        "--matrix",
        str(matrix),
        "--groups",
        str(groups),
        "--outdir",
        str(out_dir),
    ]
    if job.get("species"):
        cmd.extend(["--species", str(job["species"])])
    if job.get("lfc") is not None:
        cmd.extend(["--lfc", str(job["lfc"])])
    if job.get("padj") is not None:
        cmd.extend(["--padj", str(job["padj"])])

    env = os.environ.copy()
    env["PYTHONPATH"] = str(PIPELINE) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    if ANNOTATIONS.is_dir():
        env["KEYANTONG_RNASEQ_ANNOTATIONS"] = str(ANNOTATIONS)

    log("exec: " + " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=str(PIPELINE), env=env)

    # Ensure zip exists for portal download
    zip_path = out_dir / "rnaseq_results.zip"
    existing = list(out_dir.glob("**/rnaseq_results.zip"))
    if existing and existing[0] != zip_path:
        shutil.copy2(existing[0], zip_path)
    elif not zip_path.exists():
        zip_results(out_dir, zip_path)

    # Also place under job dir for convenience
    job_out = work / "out"
    job_out.mkdir(parents=True, exist_ok=True)
    shutil.copy2(zip_path, job_out / "rnaseq_results.zip")
    return out_dir


def process_one(job_path: Path) -> None:
    job = read_job(job_path)
    job_id = str(job.get("id", job_path.parent.name))
    kind = str(job.get("kind") or "downstream")
    job["status"] = "running"
    job["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    write_job(job_path, job)
    try:
        if kind in ("downstream", "rnaseq"):
            out_dir = run_downstream(job_path, job)
            job["status"] = "succeeded"
            job["result_dir"] = str(out_dir)
            job["summary"] = load_summary(out_dir)
            job["message"] = "downstream DE finished"
        elif kind == "upstream":
            incoming = INCOMING / job_id
            if not incoming.exists() or not any(incoming.iterdir()):
                raise FileNotFoundError(f"upstream incoming empty: {incoming}")
            job["status"] = "pending_upstream"
            job["message"] = (
                "FASTQ landed; aligner/quant pipeline not yet enabled in this image. "
                "See docs/21-rnaseq-upstream-worker.md"
            )
        else:
            raise ValueError(f"unknown kind={kind}")
    except Exception as e:
        job["status"] = "failed"
        job["error"] = str(e)[:2000]
        log(f"job {job_id} failed: {e}")
    job["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    write_job(job_path, job)


def main() -> None:
    for d in (JOBS, RESULTS, INCOMING, DATA_ROOT / "refs"):
        d.mkdir(parents=True, exist_ok=True)
    # Prefer mounted annotations volume if present
    mounted = DATA_ROOT / "annotations"
    global ANNOTATIONS
    if mounted.is_dir() and any(mounted.iterdir()):
        ANNOTATIONS = mounted
    log(
        f"watching {JOBS} max_concurrent={max_concurrent()} queue_max={queue_max()} "
        f"annotations={ANNOTATIONS}"
    )
    while True:
        running = list_by_status("running")
        queued = list_by_status("queued")
        if len(queued) > queue_max():
            log(f"queue overflow {len(queued)}>{queue_max()} (oldest wait)")
        slots = max_concurrent() - len(running)
        for meta in queued[: max(0, slots)]:
            process_one(meta)
        time.sleep(POLL)


if __name__ == "__main__":
    main()
