import json
import tempfile
import unittest
from pathlib import Path

from keyantong_ncbi.runner import prepare_and_run


class RunnerTests(unittest.TestCase):
    def base_payload(self, key: Path, folder: Path):
        # create fake fastqs
        (folder / "Leaf_T1_R1.fastq.gz").write_bytes(b"x")
        (folder / "Leaf_T1_R2.fastq.gz").write_bytes(b"x")
        key.write_text("NOT_A_REAL_KEY\n", encoding="utf-8")
        key.chmod(0o600)
        return {
            "bioproject": {
                "title": "Potato RNAseq demo",
                "description": "Demo",
                "data_type": "transcriptome",
            },
            "biosample": {
                "sample_name": "Leaf_T1",
                "organism": "Solanum tuberosum",
                "isolate_or_breed": "Desiree",
                "collection_date": "2024-06-01",
            },
            "library": {
                "library_strategy": "RNA-Seq",
                "library_source": "TRANSCRIPTOMIC",
                "library_selection": "cDNA",
                "library_layout": "paired",
            },
            "files": [
                {"filename": "Leaf_T1_R1.fastq.gz"},
                {"filename": "Leaf_T1_R2.fastq.gz"},
            ],
            "ascp": {
                "key_path": str(key),
                "local_folder": str(folder),
                "ncbi_user_email": "user@example.edu",
                "account_folder": "example.edu.folder",
            },
        }

    def test_dry_run_ok(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            key = td / "aspera.openssh"
            folder = td / "fastq"
            folder.mkdir()
            out = td / "out"
            payload = self.base_payload(key, folder)
            st = prepare_and_run(payload, outdir=out, dry_run=True)
            self.assertEqual(st.status, "dry_run")
            self.assertTrue(st.ok)
            self.assertTrue((out / "status.json").exists())
            self.assertTrue((out / "ascp_progress.log").exists())
            log = (out / "ascp_progress.log").read_text(encoding="utf-8")
            self.assertNotIn("BEGIN", log)
            self.assertIn("DRY-RUN", log)

    def test_missing_fastq_fails(self):
        with tempfile.TemporaryDirectory() as td:
            td = Path(td)
            key = td / "aspera.openssh"
            folder = td / "fastq"
            folder.mkdir()
            out = td / "out"
            payload = self.base_payload(key, folder)
            (folder / "Leaf_T1_R1.fastq.gz").unlink()
            st = prepare_and_run(payload, outdir=out, dry_run=True)
            self.assertEqual(st.status, "failed")
            self.assertFalse(st.ok)


if __name__ == "__main__":
    unittest.main()
