#!/usr/bin/env python3
"""Minimal RNAseq worker loop.

MVP: watch jobs/*/job.json with status=queued, enforce quotas, run downstream
matrix pipeline when kind=downstream. Upstream FASTQ (kind=upstream) is accepted
and marked pending_upstream until aligner image layers land (see docs/21).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from quota import assert_can_accept_job, max_concurrent, queue_max

DATA_ROOT = Path(os.environ.get("RNASEQ_DATA_ROOT", "/data/rnaseq"))
JOBS = DATA_ROOT / "jobs"
RESULTS = DATA_ROOT / "results"
INCOMING = DATA_ROOT / "incoming"
POLL = float(os.environ.get("RNASEQ_POLL_SEC", "5"))


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


def run_downstream(job_path: Path, job: dict) -> None:
    """Invoke keyantong_rnaseq CLI if matrix paths present."""
    work = job_path.parent
    matrix = work / "input" / "matrix.csv"
    groups = work / "input" / "groups.json"
    out_dir = RESULTS / job.get("id", work.name)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not matrix.exists() or not groups.exists():
        raise FileNotFoundError("downstream job missing input/matrix.csv or groups.json")
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
    # Optional passthrough flags from job spec
    if job.get("species"):
        cmd.extend(["--species", str(job["species"])])
    log("exec: " + " ".join(cmd))
    subprocess.run(cmd, check=True, cwd="/opt/rnaseq/pipeline")


def process_one(job_path: Path) -> None:
    job = read_job(job_path)
    job_id = job.get("id") or job_path.parent.name
    job["status"] = "running"
    job["worker"] = os.environ.get("HOSTNAME", "rnaseq-worker")
    write_job(job_path, job)
    try:
        assert_can_accept_job(DATA_ROOT, job_path.parent)
        kind = job.get("kind") or "downstream"
        if kind == "downstream":
            run_downstream(job_path, job)
            job["status"] = "succeeded"
            job["result_dir"] = str(RESULTS / job_id)
        elif kind == "upstream":
            # Skeleton: verify incoming present; real aligner TBD
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
    write_job(job_path, job)


def main() -> None:
    for d in (JOBS, RESULTS, INCOMING, DATA_ROOT / "refs"):
        d.mkdir(parents=True, exist_ok=True)
    log(f"watching {JOBS} max_concurrent={max_concurrent()} queue_max={queue_max()}")
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
