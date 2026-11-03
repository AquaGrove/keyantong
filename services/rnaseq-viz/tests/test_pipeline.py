import json
import tempfile
import unittest
from pathlib import Path

from rnaseq_viz.pipeline import UserInputError, run_analysis
from rnaseq_viz.stats import student_t_two_tail

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def write_matrix(path: Path, samples: list[str], rows: dict[str, list[float]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        handle.write("gene_id\t" + "\t".join(samples) + "\n")
        for gene, values in rows.items():
            handle.write(gene + "\t" + "\t".join(str(v) for v in values) + "\n")


class StatsTest(unittest.TestCase):
    def test_t_critical_approx(self):
        p = student_t_two_tail(2.228, 10)
        self.assertAlmostEqual(p, 0.05, delta=0.002)
        self.assertAlmostEqual(student_t_two_tail(0, 10), 1.0, places=6)


class PipelineTest(unittest.TestCase):
    def test_one_matrix_two_groups_makes_de_pca_volcano_heatmap(self):
        samples = ["C1", "C2", "C3", "T1", "T2", "T3"]
        rows = {
            "g_up": [1, 1.1, 0.9, 20, 21, 19],
            "g_down": [20, 21, 19, 1, 1.1, 0.9],
            "g_flat": [4, 4.2, 3.8, 4, 4.2, 3.8],
            "g_flat2": [6, 6.1, 5.9, 6, 6.1, 5.9],
        }
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            matrix = folder / "expr.tsv"
            write_matrix(matrix, samples, rows)
            summary = run_analysis(
                matrix,
                folder / "out",
                control=["C1", "C2", "C3"],
                treatments=[("treat", ["T1", "T2", "T3"])],
                species="missing-species",
                annotation_dir=FIXTURES / "annotations",
            )
            out = folder / "out"
            de = (out / "de_treat_vs_control.tsv").read_text(encoding="utf-8")
            self.assertIn("g_up", de)
            directions = {}
            for line in de.splitlines()[1:]:
                gene, _lfc, _t, _df, _p, _padj, direction = line.split("\t")
                directions[gene] = direction
            self.assertEqual(directions["g_up"], "up")
            self.assertEqual(directions["g_down"], "down")
            self.assertEqual(directions["g_flat"], "ns")
            self.assertEqual(summary["comparisons"][0]["n_up"], 1)
            self.assertEqual(summary["comparisons"][0]["n_down"], 1)
            self.assertTrue((out / "pca.png").read_bytes().startswith(b"\x89PNG"))
            self.assertIn("log2FC", (out / "volcano_treat_vs_control.svg").read_text(encoding="utf-8"))
            self.assertTrue((out / "volcano_treat_vs_control.png").read_bytes().startswith(b"\x89PNG"))
            self.assertIn("g_up", (out / "heatmap.svg").read_text(encoding="utf-8"))
            self.assertTrue((out / "heatmap.png").read_bytes().startswith(b"\x89PNG"))
            self.assertTrue(summary["venn"]["skipped"])
            self.assertIn("未找到物种", summary["enrichment"]["error"])
            self.assertTrue((out / "results.zip").is_file())
            wt = [row["PC1"] for row in summary["pca"]["scores"] if row["group"] == "control"]
            mut = [row["PC1"] for row in summary["pca"]["scores"] if row["group"] == "treat"]
            self.assertLess((sum(wt) / len(wt)) * (sum(mut) / len(mut)), 0)

    def test_two_treatments_venn_and_go(self):
        samples = ["C1", "C2", "C3", "T1", "T2", "T3", "U1", "U2", "U3"]
        flat = [4, 4.2, 3.8]
        rows = {
            "g_shared": [1, 1, 1, 16, 16, 16, 18, 18, 18],
            "g_only_t": [1, 1, 1, 16, 16, 16, 1, 1, 1],
            "g_only_u": [1, 1, 1, 1, 1, 1, 16, 16, 16],
            "g_noise": flat + flat + flat,
        }
        for i in range(8):
            rows[f"n{i}"] = [3 + (i % 3) * 0.1, 3.1, 2.9, 3 + (i % 3) * 0.1, 3.1, 2.9, 3 + (i % 3) * 0.1, 3.1, 2.9]
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            matrix = folder / "expr.tsv"
            write_matrix(matrix, samples, rows)
            summary = run_analysis(
                matrix,
                folder / "out",
                control=["C1", "C2", "C3"],
                treatments=[("alpha", ["T1", "T2", "T3"]), ("beta", ["U1", "U2", "U3"])],
                species="demo",
                annotation_dir=FIXTURES / "annotations",
            )
            out = folder / "out"
            self.assertFalse(summary["venn"]["skipped"])
            membership = (out / "venn_membership.tsv").read_text(encoding="utf-8")
            self.assertIn("g_shared", membership)
            self.assertIn("both", membership)
            self.assertGreater(summary["enrichment"]["go_terms"], 0)
            self.assertIn("defense", (out / "go_bubble.svg").read_text(encoding="utf-8"))
            saved = json.loads((out / "analysis_summary.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["input"], "expression_matrix_plus_groups")

    def test_unassigned_sample_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            matrix = folder / "expr.tsv"
            write_matrix(matrix, ["C1", "C2", "T1", "T2"], {"g1": [1, 1, 8, 8], "g2": [2, 2.2, 2, 2.1]})
            with self.assertRaises(UserInputError) as ctx:
                run_analysis(matrix, folder / "out", ["C1", "C2"], [("treat", ["T1"])])
            self.assertTrue("重复" in str(ctx.exception) or "至少" in str(ctx.exception) or "没有分到" in str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
