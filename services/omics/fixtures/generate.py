"""Deterministic synthetic data, never biological evidence."""
import csv,random
from pathlib import Path
r=random.Random(20261105);root=Path(__file__).parent;ids=[f'S{i:03d}' for i in range(60)];matrix=[]
with (root/'genotypes.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['id','chrom','pos','ref','alt',*ids])
 for i in range(150):
  d=[int(r.random()<.35)+int(r.random()<.35) for _ in ids];matrix.append(d);w.writerow([f'v{i}',str(i//50+1),(i%50+1)*10000,'A','G',*d])
with (root/'phenotypes.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['sample','trait']);w.writerows((s,3*matrix[10][i]+r.gauss(0,1)) for i,s in enumerate(ids))
with (root/'counts.csv').open('w') as f:
 w=csv.writer(f);w.writerow(['chrom','pos','ref_high','alt_high','ref_low','alt_low'])
 for i in range(200):
  alt=80 if 60<i<90 else r.randint(40,60);w.writerow(['1',(i+1)*10000,100-alt,alt,60,40])
