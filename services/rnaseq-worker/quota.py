"""Disk / size guards for single-host RNAseq worker (≤80GiB jobs by default)."""
from __future__ import annotations

import os
import shutil
from pathlib import Path


def job_max_bytes() -> int:
    return int(os.environ.get("RNASEQ_JOB_MAX_BYTES", str(80 * 1024**3)))


def disk_watermark_pct() -> float:
    return float(os.environ.get("RNASEQ_DISK_WATERMARK", "85"))


def max_concurrent() -> int:
    return max(1, int(os.environ.get("RNASEQ_MAX_CONCURRENT", "1")))


def queue_max() -> int:
    return max(1, int(os.environ.get("RNASEQ_QUEUE_MAX", "8")))


def dir_size_bytes(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            fp = Path(root) / name
            try:
                total += fp.stat().st_size
            except OSError:
                pass
    return total


def disk_usage_pct(path: Path) -> float:
    usage = shutil.disk_usage(path if path.exists() else path.parent)
    if usage.total <= 0:
        return 100.0
    return (usage.used / usage.total) * 100.0


def assert_can_accept_job(data_root: Path, job_dir: Path) -> None:
    if disk_usage_pct(data_root) >= disk_watermark_pct():
        raise RuntimeError(
            f"disk watermark exceeded ({disk_usage_pct(data_root):.1f}% >= {disk_watermark_pct()}%)"
        )
    size = dir_size_bytes(job_dir)
    if size > job_max_bytes():
        raise RuntimeError(
            f"job exceeds max bytes: {size} > {job_max_bytes()} (RNASEQ_JOB_MAX_BYTES)"
        )
