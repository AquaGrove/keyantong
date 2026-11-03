import json
import tempfile
import unittest
from pathlib import Path

from rnaseq_viz.pca import UserInputError, _jacobi, run_pca

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"


class JacobiTest(unittest.TestCase):
    def test_known_pair(self):
        evals, evecs = _jacobi([[2.0, 1.0], [1.0, 2.0]])
        self.assertAlmostEqual(evals[0], 3.0, places=6)
        self.assertAlmostEqual(evals[1], 1.0, places=6)
        self.assertAlmostEqual(abs(evecs[0][0]), abs(evecs[0][1]), places=6)

    def test_diagonalizes(self):
        matrix = [[4.0, 1.0, 2.0], [1.0, 3.0, 0.0], [2.0, 0.0, 5.0]]
        evals, evecs = _jacobi(matrix)
        for lam, vec in zip(evals, evecs):
            av = [
                sum(matrix[i][j] * vec[j] for j in range(3))
                for i in range(3)
            ]
            for got, expected in zip(av, [lam * v for v in vec]):
                self.assertAlmostEqual(got, expected, places=6)


class PcaCliTest(unittest.TestCase):
    def test_example_separates_groups(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            summary = run_pca(
                EXAMPLES / "expression_matrix.tsv",
                EXAMPLES / "sample_metadata.tsv",
                out,
                transform="log2",
                scale="zscore",
            )
            self.assertGreater(summary["variance"][0]["fraction"], 0.5)
            wt = [row["PC1"] for row in summary["scores"] if row["group"] == "WT"]
            mut = [row["PC1"] for row in summary["scores"] if row["group"] == "MUT"]
            self.assertLess((sum(wt) / len(wt)) * (sum(mut) / len(mut)), 0)
            self.assertTrue((out / "pca.png").read_bytes().startswith(b"\x89PNG"))
            self.assertTrue((out / "pca.pdf").read_bytes().startswith(b"%PDF"))
            svg = (out / "pca.svg").read_text(encoding="utf-8")
            self.assertIn("<svg", svg)
            self.assertIn("WT", svg)
            self.assertIn("PC1", (out / "pca_scores.tsv").read_text(encoding="utf-8"))
            saved = json.loads((out / "pca_summary.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["n_samples"], 6)

    def test_comma_csv_and_aliases(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            matrix = folder / "expr.csv"
            meta = folder / "meta.csv"
            matrix.write_text(
                "GeneID,A,B,C\ng1,1,2,9\ng2,1.2,2.2,8\ng3,8,9,1\ng4,7.5,8.5,1.2\n",
                encoding="utf-8",
            )
            meta.write_text("sample_id,condition\nA,ctrl\nB,ctrl\nC,treat\n", encoding="utf-8")
            summary = run_pca(matrix, meta, folder / "out")
            self.assertEqual([row["sample"] for row in summary["scores"]], ["A", "B", "C"])
            self.assertEqual(summary["scores"][2]["group"], "treat")

    def test_mismatched_sample(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            with self.assertRaises(UserInputError):
                run_pca(
                    EXAMPLES / "expression_matrix.tsv",
                    folder / "missing.tsv",
                    folder / "out",
                )

    def test_negative_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "m.tsv").write_text("gene_id\tA\tB\ng1\t1\t-1\ng2\t2\t3\n", encoding="utf-8")
            (folder / "s.tsv").write_text("sample\tgroup\nA\tK\nB\tK\n", encoding="utf-8")
            with self.assertRaises(UserInputError):
                run_pca(folder / "m.tsv", folder / "s.tsv", folder / "out", transform="log2")

    def test_missing_metadata_rejects(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "bad.tsv").write_text("sample\tgroup\nWT1\tWT\n", encoding="utf-8")
            with self.assertRaises(UserInputError) as ctx:
                run_pca(
                    EXAMPLES / "expression_matrix.tsv",
                    folder / "bad.tsv",
                    folder / "out",
                )
            self.assertIn("缺少", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
