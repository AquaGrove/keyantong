"""Windows PyInstaller entry; no credentials embedded in the executable."""
import os
import sys
from pathlib import Path
from keyantong_ncbi.native_host import main
if getattr(sys, "frozen", False):
    os.environ["KEYANTONG_EXTENSION_ORIGIN"] = (Path(sys.executable).parent / "extension-origin.txt").read_text(encoding="utf-8").strip()
main()
