import json
import tempfile
import unittest
from pathlib import Path

from rnaseq_viz.ncbi_prepare import prepare
from rnaseq_viz.table_io import UserInputError

BIO = """sample_name\torganism\ttissue
S1\tSolanum tuberosum\tleaf
S2\tSolanum tuberosum\tleaf
"""

SRA = """sample_name\tlibrary_strategy\tlibrary_source\tlibrary_selection\tlibrary_layout\tplatform\tinstrument_model\tfilename\tfilename2
S1\tRNA-Seq\tTRANSCRIPTOMIC\tcDNA\tpaired\tILLUMINA\tIllumina NovaSeq 6000\tS1_1.fastq.gz\tS1_2.fastq.gz
S2\tRNA-Seq\tTRANSCRIPTOMIC\tcDNA\tpaired\tILLUMINA\tIllumina NovaSeq 6000\tS2_1.fastq.gz\tS2_2.fastq.gz
"""


class NcbiPrepareTest(unittest.TestCase):
    def test_prepares_command_without_storing_a_real_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "bio.tsv").write_text(BIO, encoding="utf-8")
            (folder / "sra.tsv").write_text(SRA, encoding="utf-8")
            result = prepare(
                folder / "bio.tsv",
                folder / "sra.tsv",
                email="submitter@example.edu",
                account="account-folder",
                preload="preload-1",
                key_path="",
                data_dir="",
            )
            self.assertTrue(result["ok"])
            self.assertIn("<path/to/key_file>", result["ascp_command"])
            self.assertIn("submitter@example.edu:uploads/account-folder/preload-1", result["ascp_command"])
            self.assertEqual(result["files"], ["S1_1.fastq.gz", "S1_2.fastq.gz", "S2_1.fastq.gz", "S2_2.fastq.gz"])
            self.assertNotIn("aspera.openssh", json.dumps(result))

    def test_rejects_zip_and_unknown_sample(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "bio.tsv").write_text(BIO, encoding="utf-8")
            bad = SRA.replace("S2_1.fastq.gz", "S2_1.zip")
            (folder / "sra.tsv").write_text(bad, encoding="utf-8")
            with self.assertRaises(UserInputError):
                prepare(folder / "bio.tsv", folder / "sra.tsv", "a@b.edu", "acc", "pre")

    def test_report_only_cli_omits_email(self):
        from rnaseq_viz.ncbi_prepare import main

        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "bio.tsv").write_text(BIO, encoding="utf-8")
            (folder / "sra.tsv").write_text(SRA, encoding="utf-8")
            code = main(
                [
                    "--biosample",
                    str(folder / "bio.tsv"),
                    "--sra",
                    str(folder / "sra.tsv"),
                    "--email",
                    "submitter@example.edu",
                    "--account",
                    "account-folder",
                    "--preload",
                    "preload-1",
                    "--key-path",
                    "/tmp/not-a-real-key",
                    "--out-dir",
                    str(folder / "out"),
                    "--report-only",
                ]
            )
            self.assertEqual(code, 0)
            report = (folder / "out" / "ncbi_validation.json").read_text(encoding="utf-8")
            self.assertNotIn("submitter@example.edu", report)
            self.assertNotIn("not-a-real-key", report)
            self.assertFalse((folder / "out" / "upload.sh").exists())


if __name__ == "__main__":
    unittest.main()
