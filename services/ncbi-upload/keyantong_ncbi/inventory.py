"""Inspect names and sizes only. Sequencing reads stay on the local disk."""
import os
import re
from pathlib import Path

FASTQ = re.compile(r"\.(?:fastq|fq)(?:\.gz)?$", re.I)


def scan_folder(raw: str):
    path = Path(raw).expanduser()
    if not path.is_absolute():
        raise ValueError("请提供原始数据文件夹的绝对路径")
    path = path.resolve(strict=True)
    if not path.is_dir():
        raise ValueError("该路径不是文件夹，请提供原始数据文件夹")
    files = []
    ignored = 0
    with os.scandir(path) as entries:
        for number, entry in enumerate(entries, start=1):
            if number > 3000:
                raise ValueError("目录条目超过 3000 项，请按批次拆分")
            if (not FASTQ.search(entry.name) or not entry.is_file(follow_symlinks=False)
                or entry.name.startswith("-") or any(ord(c) < 32 for c in entry.name)):
                ignored += 1
                continue
            files.append({"name": entry.name, "size": entry.stat(follow_symlinks=False).st_size})
    return {"files": sorted(files, key=lambda item: item["name"]), "ignored": ignored}
