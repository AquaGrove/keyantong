import io
import json
import os
import stat
import struct
import tempfile
import time
import unittest
import zipapp
import subprocess
import sys
import shutil
from pathlib import Path
from unittest.mock import patch
from keyantong_ncbi import workflow
from keyantong_ncbi.runner import prepare_and_run
from keyantong_ncbi.validators import build_ascp_command, validate_submission
from keyantong_ncbi.native_host import capture_preload, serve
from keyantong_ncbi.installer import validate_url, Links
import test_runner

class AutomationTests(unittest.TestCase):
    def fixture(self, root):
        folder = root / "data with spaces"; folder.mkdir(); key = root / "aspera.openssh"
        payload = test_runner.RunnerTests().base_payload(key, folder)
        return payload, key, folder
    def test_manifest_and_changed_source_invalidate_approval(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"KEYANTONG_NCBI_HOME": tmp + "/state"}):
            root = Path(tmp); payload, _, folder = self.fixture(root)
            task = workflow.prepare(payload)
            self.assertEqual(task["state"], "awaiting_transfer_approval")
            self.assertEqual(len(task["files"]), 2)
            self.assertNotIn("payload", task)
            (folder / payload["files"][0]["filename"]).write_bytes(b"changed")
            workflow.execute(task["id"], task["approval"])
            status = workflow.status(task["id"])
            self.assertEqual(status["state"], "transfer_failed")
            self.assertIn("变化", status["message"])
    def test_extra_files_and_keys_are_not_uploaded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); payload, key, folder = self.fixture(root)
            (folder / "unrelated.txt").write_text("private")
            result = prepare_and_run(payload, outdir=root / "out", dry_run=True)
            self.assertFalse(result.ok)
            self.assertTrue(any("清单以外" in i["message"] for i in result.issues))
            (folder / "unrelated.txt").unlink(); key.rename(folder / "aspera.openssh"); payload["ascp"]["key_path"] = str(folder / "aspera.openssh")
            self.assertFalse(prepare_and_run(payload, outdir=root / "out2", dry_run=True).ok)
    def test_path_traversal_rate_and_target_injection(self):
        with tempfile.TemporaryDirectory() as tmp:
            payload, _, _ = self.fixture(Path(tmp))
            payload["files"][0]["filename"] = "../outside.fastq.gz"
            self.assertFalse(validate_submission(payload).ok)
            cmd, issues = build_ascp_command(key_path="/tmp/key", local_folder="/tmp/data", ncbi_user_email="", account_folder="folder;touch /tmp/bad", rate="100m;echo nope")
            self.assertIsNone(cmd); self.assertTrue(any(i.level == "error" for i in issues))
    @unittest.skipIf(os.name == "nt", "POSIX fake executable")
    def test_silent_process_times_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); payload, _, _ = self.fixture(root)
            fake = root / "fake ascp"; fake.write_text("#!/usr/bin/env python3\nimport time\ntime.sleep(30)\n"); fake.chmod(0o700)
            start = time.monotonic(); result = prepare_and_run(payload, outdir=root / "out", dry_run=False, ascp_bin=str(fake), timeout_sec=1)
            self.assertLess(time.monotonic() - start, 5); self.assertFalse(result.ok); self.assertIn("超时", result.message)
    @unittest.skipIf(os.name == "nt", "POSIX fake executable")
    def test_spaces_are_single_arguments_and_transfer_is_not_submission(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); payload, key, folder = self.fixture(root); seen = root / "args.json"
            fake = root / "fake ascp"; fake.write_text("#!/usr/bin/env python3\nimport json,sys,pathlib\npathlib.Path(" + repr(str(seen)) + ").write_text(json.dumps(sys.argv[1:]))\n"); fake.chmod(0o700)
            result = prepare_and_run(payload, outdir=root / "out", dry_run=False, ascp_bin=str(fake))
            self.assertTrue(result.ok); args = json.loads(seen.read_text()); self.assertIn(str(folder.resolve()), args); self.assertEqual(args[1], str(key)); self.assertIn("仍需", result.message)
            self.assertFalse(next(s["done"] for s in result.portal_checklist["steps"] if s["id"] == "sra_submit"))
    def test_preload_key_import_rejects_html_and_target_changes(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"KEYANTONG_NCBI_HOME": tmp + "/state"}):
            key = Path(tmp) / "download.openssh"; key.write_text("<html>login</html>")
            command = "ascp -i key -QT -l100m -k1 -d data subasp@upload.ncbi.nlm.nih.gov:uploads/example_account"
            with self.assertRaises(ValueError): capture_preload(command, str(key))
            key.write_text("-----BEGIN OPENSSH PRIVATE KEY-----\nTEST_ONLY\n")
            captured = capture_preload(command, str(key)); self.assertEqual(captured["account_folder"], "example_account")
            if os.name != "nt": self.assertEqual(stat.S_IMODE(Path(captured["key_path"]).stat().st_mode), 0o600)
            with self.assertRaises(ValueError): capture_preload(command.replace("upload.ncbi.nlm.nih.gov", "evil.example"), str(key))
    def test_native_protocol_roundtrip_and_size_limit(self):
        body = json.dumps({"action": "doctor", "requestId": "one"}).encode(); target = io.BytesIO()
        with patch("keyantong_ncbi.native_host.handle", return_value={"system": "Test"}): serve(io.BytesIO(struct.pack("=I", len(body)) + body), target)
        result = target.getvalue(); data = json.loads(result[4:4 + struct.unpack("=I", result[:4])[0]])
        self.assertTrue(data["ok"]); self.assertEqual(data["requestId"], "one")
        target = io.BytesIO(); serve(io.BytesIO(struct.pack("=I", 99999999)), target); self.assertEqual(target.getvalue(), b"")
    def test_portable_native_archive_boots_protocol(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = Path(__file__).resolve().parents[1] / "keyantong_ncbi"
            bundle = root / "bundle"; bundle.mkdir()
            shutil.copytree(source, bundle / "keyantong_ncbi", ignore=shutil.ignore_patterns("__pycache__"))
            archive = root / "host.pyz"; zipapp.create_archive(bundle, archive, main="keyantong_ncbi.native_host:main")
            origin = "chrome-extension://" + "a" * 32 + "/"
            body = json.dumps({"action": "doctor", "requestId": "zipapp"}).encode()
            result = subprocess.run([sys.executable, str(archive), origin], input=struct.pack("=I", len(body)) + body, capture_output=True, env={**os.environ, "KEYANTONG_EXTENSION_ORIGIN": origin}, timeout=10)
            self.assertEqual(result.returncode, 0)
            data = json.loads(result.stdout[4:]); self.assertTrue(data["ok"]); self.assertIn("system", data["data"])
            wrong = subprocess.run([sys.executable, str(archive), "chrome-extension://wrong/"], capture_output=True, env={**os.environ, "KEYANTONG_EXTENSION_ORIGIN": origin}, timeout=10)
            self.assertNotEqual(wrong.returncode, 0); self.assertFalse(wrong.stdout)
    def test_only_official_installer_urls(self):
        validate_url("https://d3gcli72yxqn2z.cloudfront.net/downloads/connect/x.pkg")
        for url in ["http://www.ibm.com/x", "https://www.ibm.com.evil.test/x", "https://evil.test/installer", "file:///tmp/pkg"]:
            with self.assertRaises(ValueError): validate_url(url)
        parser = Links(); parser.feed('<a href="https://d3gcli72yxqn2z.cloudfront.net/a.msi">Download</a>'); self.assertEqual(len(parser.links), 1)
if __name__ == "__main__": unittest.main()
