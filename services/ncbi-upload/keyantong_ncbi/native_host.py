"""Chrome native messaging: no open TCP listener, cookies or passwords."""
from __future__ import annotations
import base64
import json
import stat
import os
import shutil
import struct
import sys
from pathlib import Path
from . import workflow
from .inventory import scan_folder
from .installer import doctor, download_installer, launch_installer
import re
HOST_NAME = "org.keyantong.ncbi"
MAX_MESSAGE = 256000

def capture_preload(command: str, key_path: str):
    if len(command) > 4000: raise ValueError("命令过长")
    match = re.search(r"subasp@upload\.ncbi\.nlm\.nih\.gov:uploads/([A-Za-z0-9_@.-]+)(?:\s|$)", command)
    if not match or match[1] in {".", ".."}: raise ValueError("未识别到 NCBI 官方 preload 目标，请在账户上传说明中重新读取")
    key = Path(key_path).expanduser()
    if not key.is_absolute() or not key.is_file() or key.is_symlink() or key.stat().st_size > 65536: raise ValueError("私钥路径无效，请先在已登录的 NCBI 页面下载")
    with key.open("rb") as stream:
        first = stream.readline(200)
    if not re.match(br"-----BEGIN (?:OPENSSH |RSA |DSA |EC |ENCRYPTED )?PRIVATE KEY-----", first):
        raise ValueError("下载内容不是可识别的私钥，请确认 NCBI 登录状态后重新下载")
    dest = workflow.home() / "credentials" / "aspera.openssh"; dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copyfile(key, dest); dest.chmod(0o600)
    config = {"key_path": str(dest), "account_folder": match[1]}
    workflow.write_json(workflow.home() / "preload.json", config)
    return {"captured": True, "account_folder": match[1], "key_path": str(dest)}

def handle(message: dict):
    action = message.get("action")
    if action == "scan_folder": return scan_folder(str(message.get("path", "")))
    if action == "doctor": return doctor()
    if action == "capture_preload": return capture_preload(str(message.get("command", "")), str(message.get("keyPath", "")))
    if action == "download_installer": return download_installer(workflow.home() / "installers")
    if action == "launch_installer": return launch_installer(workflow.home() / "installers")
    if action == "prepare":
        payload = message.get("payload")
        if not isinstance(payload, dict): raise ValueError("请选择本机元数据 JSON")
        if any(k in json.dumps(payload).lower() for k in ["private_key", "key_content", '"password"', "begin openssh", "begin rsa"]): raise ValueError("元数据不能包含密码或私钥正文")
        try:
            preload = workflow.read_json(workflow.home() / "preload.json")
        except FileNotFoundError:
            raise ValueError("请先打开科研通本机助手，从已登录的 NCBI 页面导入 preload 账户目录和密钥") from None
        payload["ascp"] = {**(payload.get("ascp") or {}), **preload, "local_folder": str(message.get("localFolder", ""))}
        return workflow.prepare(payload)
    if action == "start": return workflow.start(str(message.get("taskId", "")), str(message.get("approval", "")))
    if action == "status": return workflow.status(str(message.get("taskId", "")))
    raise ValueError("不支持的本机操作")

def read_exact(stream, count):
    parts = bytearray()
    while len(parts) < count:
        chunk = stream.read(count - len(parts))
        if not chunk: return None
        parts.extend(chunk)
    return bytes(parts)
def write_frame(stream, payload):
    encoded = json.dumps(payload, ensure_ascii=False).encode()
    if len(encoded) > 900000:
        encoded = json.dumps({"ok": False, "error": "任务清单过大，请拆分提交", "requestId": payload.get("requestId")}).encode()
    stream.write(struct.pack("=I", len(encoded)) + encoded)
    stream.flush()


def stream_analysis_file(message, target):
    raw = message.get("path")
    if not isinstance(raw, str) or len(raw) > 4096 or any(ord(c) < 32 for c in raw):
        raise ValueError("文件路径无效")
    path = Path(raw).expanduser()
    if not path.is_absolute() or path.suffix.lower() not in {".csv", ".tsv", ".json"}:
        raise ValueError("请输入 CSV、TSV 或 JSON 文件的本机绝对路径")
    if path.resolve(strict=True) != path or not path.is_file():
        raise ValueError("请选择实际文件路径，不能读取目录或链接")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_BINARY", 0)
    with os.fdopen(os.open(path, flags), "rb") as stream:
        meta = os.fstat(stream.fileno())
        if not stat.S_ISREG(meta.st_mode) or not 0 < meta.st_size <= 80 * 1024 * 1024:
            raise ValueError("只能读取 80 MB 以内的非空普通文件")
        remaining = meta.st_size
        write_frame(target, {"kind": "start", "name": path.name, "size": remaining})
        while remaining:
            block = stream.read(min(384 * 1024, remaining))
            if not block:
                raise ValueError("文件在读取时发生变化，请重试")
            if remaining == meta.st_size and re.search(br"-----BEGIN [^\r\n]*PRIVATE KEY|\"key_content\"\s*:", block, re.I):
                raise ValueError("文件包含私钥内容，请先移除")
            remaining -= len(block)
            write_frame(target, {"kind": "chunk", "bytes": base64.b64encode(block).decode("ascii")})
        after = os.fstat(stream.fileno())
        if after.st_mtime_ns != meta.st_mtime_ns or after.st_size != meta.st_size:
            raise ValueError("文件在读取时发生变化，请重试")
        write_frame(target, {"kind": "done"})


def serve(stdin=None, stdout=None):
    source = stdin or sys.stdin.buffer; target = stdout or sys.stdout.buffer
    while True:
        header = read_exact(source, 4)
        if header is None: break
        size = struct.unpack("=I", header)[0]
        if size > MAX_MESSAGE: break
        raw = read_exact(source, size)
        if raw is None: break
        request_id = None
        try:
            message = json.loads(raw); request_id = str(message.get("requestId", ""))[:100]
            if message.get("action") == "stream_analysis_file":
                stream_analysis_file(message, target)
                continue
            result = {"ok": True, "data": handle(message), "requestId": request_id}
        except FileNotFoundError:
            result = {"ok": False, "error": "本机找不到该文件，请核对路径", "requestId": request_id}
        except PermissionError:
            result = {"ok": False, "error": "本机助手没有读取此文件的权限", "requestId": request_id}
        except Exception as e:
            result = {"ok": False, "error": str(e)[:500], "requestId": request_id}
        write_frame(target, result)
def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--workflow":
        from .workflow import main as workflow_main
        del sys.argv[1]
        workflow_main()
        return
    expected = os.environ.get("KEYANTONG_EXTENSION_ORIGIN")
    if not expected or len(sys.argv) < 2 or sys.argv[1] != expected: raise SystemExit("Unknown extension origin")
    if os.name == "nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY); msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    serve()
if __name__ == "__main__": main()
