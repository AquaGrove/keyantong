#!/usr/bin/env python3
"""Install the reviewed local native host for ONE explicitly selected extension."""
import argparse
import json
import os
import platform
import re
import shlex
import shutil
import sys
import tempfile
import zipapp
from pathlib import Path

def main():
    p = argparse.ArgumentParser(); p.add_argument("--extension-id", required=True); p.add_argument("--windows-exe", type=Path); p.add_argument("--browser", choices=("chrome", "edge"), default="chrome"); args = p.parse_args()
    if not re.fullmatch("[a-p]{32}", args.extension_id): p.error("extension id must be the 32-letter id from chrome://extensions")
    system = platform.system(); root = Path.home() / ".keyantong/ncbi/app"; root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if args.browser == "edge":
        root = root / "edge"
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
    source = Path(__file__).resolve().parents[1] / "keyantong_ncbi"
    if system == "Windows":
        if not args.windows_exe or args.windows_exe.suffix.lower() != ".exe" or not args.windows_exe.is_file(): p.error("Windows requires a locally built/reviewed native executable; see README")
        launcher = root / "keyantong-ncbi-host.exe"; shutil.copy2(args.windows_exe, launcher)
        # This configuration is read by the frozen launcher.
        (root / "extension-origin.txt").write_text(f"chrome-extension://{args.extension_id}/", encoding="utf-8")
        directory = root
    elif system in {"Darwin", "Linux"}:
        archive = root / "keyantong-ncbi-host.pyz"
        with tempfile.TemporaryDirectory() as tmp:
            shutil.copytree(source, Path(tmp) / "keyantong_ncbi", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            zipapp.create_archive(tmp, archive, main="keyantong_ncbi.native_host:main")
        launcher = root / "keyantong-ncbi-host"
        launcher.write_text(f"#!/bin/sh\nexport KEYANTONG_EXTENSION_ORIGIN={shlex.quote('chrome-extension://' + args.extension_id + '/')}\nexec {shlex.quote(sys.executable)} {shlex.quote(str(archive))} \"$@\"\n", encoding="utf-8"); launcher.chmod(0o700)
        browser_dir = ("Microsoft Edge" if args.browser == "edge" else "Google/Chrome") if system == "Darwin" else ("microsoft-edge" if args.browser == "edge" else "google-chrome")
        config_dir = "Library/Application Support" if system == "Darwin" else ".config"
        directory = Path.home() / config_dir / browser_dir / "NativeMessagingHosts"
    else: p.error("unsupported operating system")
    manifest = {"name": "org.keyantong.ncbi", "description": "KeyanTong local SRA assistant", "path": str(launcher), "type": "stdio", "allowed_origins": [f"chrome-extension://{args.extension_id}/"]}
    directory.mkdir(parents=True, exist_ok=True); dest = directory / "org.keyantong.ncbi.json"; dest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    if system == "Windows":
        import winreg
        vendor = r"Microsoft\Edge" if args.browser == "edge" else r"Google\Chrome"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\{vendor}\NativeMessagingHosts\org.keyantong.ncbi") as key: winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(dest))
    print("Native host registered for the specified extension. Restart the assistant tab to connect.")
if __name__ == "__main__": main()
