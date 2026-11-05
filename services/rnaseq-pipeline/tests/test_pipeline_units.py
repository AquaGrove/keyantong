import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from keyantong_rnaseq.de import (
    available_engines,
    engine_catalog,
    run_de_limma_like,
    run_de_samples,
    run_de_welch,
)
from keyantong_rnaseq.enrichment import list_species_status, normalize_species, run_enrichment
from keyantong_rnaseq.plots import exclusive_region_counts, plot_multi_set_venn
from keyantong_rnaseq.r_backends import available_r_engines, detect_r_packages


class DeTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(0)
        genes = [f"G{i}" for i in range(40)]
        data = {}
        for s in ["C1", "C2", "C3"]:
            data[s] = rng.normal(8, 0.4, size=40)
        for s in ["T1", "T2", "T3"]:
            data[s] = rng.normal(8, 0.4, size=40)
        for i in range(8):
            for s in ["T1", "T2", "T3"]:
                data[s][i] = data[s][i] * 4.0 + 20.0
        self.matrix = pd.DataFrame(data, index=genes)
        counts = {}
        for s in ["C1", "C2", "C3"]:
            counts[s] = np.maximum(np.rint(rng.normal(50, 10, size=40)), 1).astype(int)
        for s in ["T1", "T2", "T3"]:
            counts[s] = np.maximum(np.rint(rng.normal(50, 10, size=40)), 1).astype(int)
        for i in range(8):
            for s in ["T1", "T2", "T3"]:
                counts[s][i] = counts[s][i] * 8 + 200
        self.counts = pd.DataFrame(counts, index=genes)

    def test_limma_like_finds_signal(self):
        deg = run_de_limma_like(
            self.matrix, ["C1", "C2", "C3"], ["T1", "T2", "T3"], lfc_cutoff=1.0, padj_cutoff=0.1
        )
        self.assertEqual(deg["engine"].iloc[0], "limma_like")
        self.assertGreater(int((deg["regulation"] == "up").sum()), 0)

    def test_welch_runs(self):
        deg = run_de_welch(self.matrix, ["C1", "C2", "C3"], ["T1", "T2", "T3"])
        self.assertEqual(deg["engine"].iloc[0], "welch")

    def test_available_engines_and_catalog(self):
        eng = available_engines()
        self.assertIn("limma_like", eng)
        self.assertIn("welch", eng)
        cat = engine_catalog()
        self.assertIn("available", cat)
        self.assertIn("probe", cat)

    def test_each_available_engine_fixture(self):
        for name in available_engines():
            with self.subTest(engine=name):
                mat = self.counts if name in {"r_edger", "r_deseq2", "pydeseq2"} else self.matrix
                deg = run_de_samples(
                    mat,
                    ["C1", "C2", "C3"],
                    ["T1", "T2", "T3"],
                    engine=name,
                    lfc_cutoff=0.5,
                    padj_cutoff=0.2,
                    contrast_id=f"test_{name}",
                )
                self.assertFalse(deg.empty)
                used = str(deg["engine"].iloc[0])
                if name.startswith("r_"):
                    self.assertTrue(used.startswith("r_") or used == name)
                else:
                    self.assertEqual(used, name)

    def test_r_limma_when_present(self):
        pkgs = detect_r_packages()
        if not pkgs.get("limma"):
            self.skipTest("R limma not installed")
        deg = run_de_samples(
            self.matrix,
            ["C1", "C2", "C3"],
            ["T1", "T2", "T3"],
            engine="r_limma",
            contrast_id="rlimma",
        )
        self.assertEqual(deg["engine"].iloc[0], "r_limma")
        self.assertIn("r_limma", available_r_engines())


class VennTests(unittest.TestCase):
    def test_exclusive_regions(self):
        sets = {"A": {"1", "2", "3"}, "B": {"2", "3", "4"}, "C": {"3", "5"}}
        c = exclusive_region_counts(sets)
        self.assertEqual(c["A"], 1)
        self.assertEqual(c["B"], 1)
        self.assertEqual(c["C"], 1)
        self.assertEqual(c["A&B"], 1)
        self.assertEqual(c["A&B&C"], 1)

    def test_four_set_plot_writes_regions(self):
        sets = {
            "A": {"1", "2", "3", "9"},
            "B": {"2", "3", "4"},
            "C": {"3", "5", "9"},
            "D": {"3", "6", "9"},
        }
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "venn4"
            paths = plot_multi_set_venn(sets, out, title="four")
            names = [p.name for p in paths]
            self.assertTrue(any(n.endswith("_regions.csv") for n in names))
            regions = pd.read_csv(out.parent / "venn4_regions.csv")
            self.assertGreater(len(regions), 4)


class EnrichTests(unittest.TestCase):
    def test_demo_enrichment_go_and_kegg(self):
        genes = [f"GENE{i:03d}" for i in range(1, 21)]
        out = Path("/tmp/keyantong-enrich-test")
        out.mkdir(exist_ok=True)
        res = run_enrichment(genes, "demo", out)
        self.assertIn(res.status, ("ok", "ok_empty"))
        self.assertEqual(normalize_species("Homo sapiens"), "human")
        self.assertTrue((out / "kegg_enrichment.csv").exists())
        status = list_species_status()
        demo = next(s for s in status if s["species"] == "demo")
        self.assertTrue(demo["ready_go"])
        self.assertTrue(demo["ready_kegg"])


if __name__ == "__main__":
    unittest.main()

class EngineSafetyTests(unittest.TestCase):
    def test_explicit_engine_never_silently_downgrades(self):
        from unittest.mock import patch
        from keyantong_rnaseq.de import run_de_samples
        matrix=pd.DataFrame([[1,2,3,4]],index=['g'],columns=['a','b','c','d'])
        with patch('keyantong_rnaseq.r_backends.run_de_r',side_effect=RuntimeError('missing dependency')), patch('keyantong_rnaseq.de.run_de_limma_like') as fallback:
            with self.assertRaises(RuntimeError):run_de_samples(matrix,['a','b'],['c','d'],engine='r_limma')
            fallback.assert_not_called()
    def test_unknown_engine_rejected(self):
        from keyantong_rnaseq.de import run_de_samples
        matrix=pd.DataFrame([[1,2,3,4]],index=['g'],columns=['a','b','c','d'])
        with self.assertRaises(ValueError):run_de_samples(matrix,['a','b'],['c','d'],engine='unknown')
    def test_auto_fallback_records_reason(self):
        from unittest.mock import patch
        from keyantong_rnaseq.de import run_de_samples
        matrix=pd.DataFrame([[1,2,3,4]],index=['g'],columns=['a','b','c','d'])
        with patch('keyantong_rnaseq.r_backends.available_r_engines',return_value=['r_limma']),patch('keyantong_rnaseq.r_backends.run_de_r',side_effect=RuntimeError('dependency unavailable')),patch('keyantong_rnaseq.de.run_de_limma_like',return_value=pd.DataFrame({'engine':['limma_like']})):
            result=run_de_samples(matrix,['a','b'],['c','d'],engine='auto')
            self.assertIn('dependency unavailable',result.attrs['engine_fallbacks'][0])
