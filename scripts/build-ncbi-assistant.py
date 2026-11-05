#!/usr/bin/env python3
"""Reproducible source-only preview bundle. Never include runtime user data."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
root = Path(__file__).resolve().parents[1]
files = [*root.glob("services/ncbi-upload/keyantong_ncbi/*.py"), *root.glob("services/ncbi-upload/extension/*"), *root.glob("services/ncbi-upload/scripts/*.py"), root / "services/ncbi-upload/README.md", root / "services/ncbi-upload/pyproject.toml", root / "docs/29-ncbi-automation.md", root / "skills/ncbi-local-upload/SKILL.md"]
out = root / "apps/portal/public/downloads/keyantong-ncbi-assistant-preview.zip"; out.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(out, "w", compression=ZIP_DEFLATED) as archive:
    for file in sorted(files):
        if not file.is_file() or file.suffix not in {".py", ".js", ".json", ".html", ".css", ".md", ".toml"}: continue
        info = ZipInfo(str(file.relative_to(root)), (2026, 11, 5, 0, 0, 0)); info.compress_type = ZIP_DEFLATED; info.external_attr = 0o644 << 16
        archive.writestr(info, file.read_bytes())
out.with_suffix(".sha256").write_text(hashlib.sha256(out.read_bytes()).hexdigest() + "  " + out.name + "\n")
print(f"Built {out.name} ({out.stat().st_size} bytes)")
