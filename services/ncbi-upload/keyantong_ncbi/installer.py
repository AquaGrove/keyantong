"""Discover and download the installer linked by IBM, then launch its native UI.
No bundled IBM binaries, silent EULA acceptance or guessed ARM installers.
"""
from __future__ import annotations
import hashlib
import json
import os
import platform
import re
import subprocess
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from .runner import find_ascp

IBM_DOWNLOADS = "https://www.ibm.com/products/aspera/downloads"
ALLOWED_HOSTS = {"www.ibm.com", "ibm.com", "d3gcli72yxqn2z.cloudfront.net"}
class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)
def validate_url(url: str):
    u = urllib.parse.urlsplit(url)
    if u.scheme != "https" or u.hostname not in ALLOWED_HOSTS or u.username or u.password:
        raise ValueError("安装文件只能来自 IBM 官方页面已验证的 HTTPS 下载域名")
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href", "")
            if href: self.links.append(urllib.parse.urljoin(IBM_DOWNLOADS, href))
def doctor():
    return {"system": platform.system(), "architecture": platform.machine(), "ascp": find_ascp(), "downloadPage": IBM_DOWNLOADS}
def download_installer(dest: Path):
    system, arch = platform.system(), platform.machine().lower()
    if system not in {"Windows", "Darwin", "Linux"}: raise ValueError("暂不支持该系统")
    opener = urllib.request.build_opener(OfficialRedirect())
    with opener.open(IBM_DOWNLOADS, timeout=30) as r:
        parser = Links(); parser.feed(r.read(2_000_000).decode("utf-8", "replace"))
    pattern = {"Windows": r"connect.*win32_AMD64\.msi$", "Darwin": r"connect.*macOS_x86_64\.pkg$", "Linux": r"connect.*linux_x86_64\.tar\.gz$"}[system]
    urls = [u for u in parser.links if re.search(pattern, u, re.I)]
    if len(set(urls)) != 1: raise ValueError("IBM 下载页面已变化，请从官方下载页选择安装包")
    if arch not in {"x86_64", "amd64", "i386", "i686"}: raise ValueError("当前官方链接为 x86_64 安装包；此架构需在 IBM 官方页面确认兼容版本后安装")
    url = urls[0]; validate_url(url); dest.mkdir(parents=True, exist_ok=True)
    output = dest / Path(urllib.parse.urlsplit(url).path).name
    partial = output.with_name(output.name + ".part"); digest = hashlib.sha256(); size = 0
    try:
        with opener.open(url, timeout=60) as r, partial.open("wb") as out:
            validate_url(r.geturl())
            while chunk := r.read(1024 * 1024):
                size += len(chunk)
                if size > 300 * 1024 * 1024: raise ValueError("安装包超过预期大小")
                out.write(chunk); digest.update(chunk)
        if size < 10000: raise ValueError("下载内容异常，未保存为安装包")
        partial.replace(output)
    finally:
        partial.unlink(missing_ok=True)
    receipt = {"path": str(output), "sha256": digest.hexdigest(), "bytes": size, "source": url, "system": system, "architecture": arch}
    (dest / "installer-receipt.json").write_text(json.dumps(receipt), encoding="utf-8")
    return receipt
def launch_installer(dest: Path):
    receipt = json.loads((dest / "installer-receipt.json").read_text(encoding="utf-8")); installer = Path(receipt["path"]).resolve()
    if installer.parent != dest.resolve(): raise ValueError("安装包路径无效")
    digest = hashlib.sha256()
    with installer.open("rb") as f:
        while chunk := f.read(1024 * 1024): digest.update(chunk)
    if digest.hexdigest() != receipt["sha256"]: raise ValueError("安装包已变化，请重新下载")
    system = platform.system()
    if system == "Darwin":
        result = subprocess.run(["pkgutil", "--check-signature", str(installer)], capture_output=True, text=True, timeout=30)
        if result.returncode or not re.search(r"IBM|International Business Machines", result.stdout, re.I): raise ValueError("安装包未通过 IBM 签名检查")
        if subprocess.run(["spctl", "--assess", "--type", "install", str(installer)], capture_output=True, timeout=30).returncode: raise ValueError("macOS 未信任安装包，请在本机检查")
        subprocess.Popen(["open", str(installer)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    elif system == "Windows":
        script = "$s=Get-AuthenticodeSignature -LiteralPath $env:KT_ASPERA_INSTALLER; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'IBM|International Business Machines'){exit 1}"
        result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], env={**os.environ, "KT_ASPERA_INSTALLER": str(installer)}, timeout=30, capture_output=True)
        if result.returncode: raise ValueError("安装包未通过 IBM Authenticode 签名检查")
        subprocess.Popen(["msiexec.exe", "/i", str(installer)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        return {"status": "manual_install_required", "path": str(installer), "message": "Linux 包已下载；请按 IBM 说明审核并执行安装，再重新检测 ascp。"}
    return {"status": "installer_opened", "message": "请在本机安装界面确认许可与安装，完成后重新检测 ascp。"}
