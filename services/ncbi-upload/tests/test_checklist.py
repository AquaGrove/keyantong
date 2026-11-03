import unittest
from keyantong_ncbi.portal_checklist import checklist_from_status

class ChecklistTests(unittest.TestCase):
    def test_dry_run_marks_steps(self):
        st = checklist_from_status(
            {"status": "dry_run", "ok": True, "command": "ascp ...", "issues": [], "message": "ok"}
        )
        self.assertEqual(st["automation_policy"], "no_browser_automation")
        done = {s["id"]: s["done"] for s in st["steps"]}
        self.assertTrue(done["validate"])
        self.assertTrue(done["dry_run"])
        self.assertFalse(done["portal_login"])
        self.assertEqual(st["next"], "ascp_upload")

if __name__ == "__main__":
    unittest.main()
