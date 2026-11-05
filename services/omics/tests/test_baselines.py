import unittest,tempfile,json
from pathlib import Path
from keyantong_omics.run import bh,run,InputError
class Tests(unittest.TestCase):
 def test_registry_matches_implementations(self):
  from keyantong_omics.run import EXECUTORS
  registry=Path('/opt/omics/methods.json')
  if not registry.exists():registry=Path(__file__).resolve().parents[3]/'catalog/analysis/methods.json'
  methods=json.loads(registry.read_text())['methods'];self.assertEqual(set(EXECUTORS),{m['id'] for m in methods})
  for m in methods:self.assertTrue(all('/' not in f and f.endswith('.csv') for f in m['files']))
 def test_bh(self):self.assertEqual(list(bh([.01,.04,.03])),[.03,.04,.04])
 def test_bsa(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t);(p/'counts.csv').write_text('chrom,pos,ref_high,alt_high,ref_low,alt_low\n1,10,10,90,90,10\n1,20,50,50,50,50\n1,30,1,1,2,1\n')
   result=run('bsa.delta.v1',p,p/'out',{'minDepth':10});self.assertEqual(result['retainedVariants'],2);self.assertEqual(result['windows'],1);self.assertTrue((p/'out/manifest.json').exists())
 def test_negative(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t);(p/'counts.csv').write_text('chrom,pos,ref_high,alt_high,ref_low,alt_low\n1,10,-1,90,90,10\n')
   with self.assertRaises(InputError):run('bsa.delta.v1',p,p/'out',{})
 def test_multi_ploidy_block(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)
   with self.assertRaises(InputError):run('gwas.plink-linear.v1',p,p/'out',{'ploidy':4})
if __name__=='__main__':unittest.main()
