import unittest
from keyantong_ncbi.validators import validate_submission, build_ascp_command


class ValidatorTests(unittest.TestCase):
    def minimal_ok(self):
        return {
            "bioproject": {
                "title": "Potato RNAseq demo",
                "description": "Demo project for KeyanTong",
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
                "key_path": "/Users/nature/keys/aspera.openssh",
                "local_folder": "/Users/nature/data/sra_upload",
                "ncbi_user_email": "user@example.edu",
                "account_folder": "example.edu.folder",
            },
        }

    def test_ok_payload(self):
        res = validate_submission(self.minimal_ok())
        self.assertTrue(res.ok)
        self.assertIsNotNone(res.ascp_command)
        self.assertIn("ascp -i /Users/nature/keys/aspera.openssh", res.ascp_command)
        self.assertNotIn("BEGIN", res.ascp_command or "")

    def test_missing_fields(self):
        bad = self.minimal_ok()
        bad["bioproject"]["title"] = ""
        bad["files"] = []
        res = validate_submission(bad)
        self.assertFalse(res.ok)
        fields = {i.field for i in res.issues if i.level == "error"}
        self.assertIn("bioproject.title", fields)
        self.assertIn("files", fields)

    def test_relative_key_rejected(self):
        cmd, issues = build_ascp_command(
            key_path="aspera.openssh",
            local_folder="/tmp/data",
            ncbi_user_email="a@b.edu",
            account_folder="folder",
        )
        self.assertIsNone(cmd)
        self.assertTrue(any("绝对路径" in i.message for i in issues))

    def test_paired_odd_files(self):
        payload = self.minimal_ok()
        payload["files"] = [{"filename": "only_R1.fastq.gz"}]
        res = validate_submission(payload)
        self.assertFalse(res.ok)
        self.assertTrue(any("偶数" in i.message for i in res.issues))


if __name__ == "__main__":
    unittest.main()
