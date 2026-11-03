import unittest
from pathlib import Path
import numpy as np
import pandas as pd

from keyantong_rnaseq.de import run_de_limma_like, run_de_welch, available_engines
from keyantong_rnaseq.plots import exclusive_region_counts
from keyantong_rnaseq.enrichment import run_enrichment, normalize_species


class DeTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(0)
        genes = [f"G{i}" for i in range(40)]
        data = {}
        for s in ["C1", "C2", "C3"]:
            data[s] = rng.normal(8, 0.4, size=40)
        for s in ["T1", "T2", "T3"]:
            data[s] = rng.normal(8, 0.4, size=40)
        # plant strong fold-change in first 8 genes (post log2 still |LFC|>=1)
        for i in range(8):
            for s in ["T1", "T2", "T3"]:
                data[s][i] = data[s][i] * 4.0 + 20.0
        self.matrix = pd.DataFrame(data, index=genes)

    def test_limma_like_finds_signal(self):
        deg = run_de_limma_like(self.matrix, ["C1", "C2", "C3"], ["T1", "T2", "T3"], lfc_cutoff=1.0, padj_cutoff=0.1)
        self.assertEqual(deg["engine"].iloc[0], "limma_like")
        self.assertGreater(int((deg["regulation"] == "up").sum()), 0)

    def test_welch_runs(self):
        deg = run_de_welch(self.matrix, ["C1", "C2", "C3"], ["T1", "T2", "T3"])
        self.assertEqual(deg["engine"].iloc[0], "welch")

    def test_available_engines(self):
        eng = available_engines()
        self.assertIn("limma_like", eng)
        self.assertIn("welch", eng)


class VennTests(unittest.TestCase):
    def test_exclusive_2(self):
        sets = {"A": {"1", "2", "3"}, "B": {"3", "4"}}
        c = exclusive_region_counts(sets)
        self.assertEqual(c["A"], 2)
        self.assertEqual(c["B"], 1)
        self.assertEqual(c["A&B"], 1)

    def test_exclusive_3(self):
        sets = {"A": {"1", "2", "3"}, "B": {"2", "3", "4"}, "C": {"3", "5"}}
        c = exclusive_region_counts(sets)
        self.assertEqual(c["A"], 1)
        self.assertEqual(c["B"], 1)
        self.assertEqual(c["C"], 1)
        self.assertEqual(c["A&B"], 1)
        self.assertEqual(c["A&B&C"], 1)


class EnrichTests(unittest.TestCase):
    def test_demo_enrichment(self):
        genes = [f"GENE{i:03d}" for i in range(1, 21)]
        out = Path("/tmp/keyantong-enrich-test")
        out.mkdir(exist_ok=True)
        res = run_enrichment(genes, "demo", out)
        self.assertIn(res.status, ("ok", "ok_empty"))
        self.assertEqual(normalize_species("Homo sapiens"), "human")


if __name__ == "__main__":
    unittest.main()
