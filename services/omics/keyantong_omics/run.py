"""Allowlisted, independently implemented baseline analyses. No model-generated commands."""
from __future__ import annotations
import argparse,csv,hashlib,json,re,subprocess,time,os
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import fisher_exact
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
SAFE=re.compile(r'^[A-Za-z0-9_.-]{1,100}$')
class InputError(ValueError):pass

def bh(p):
 p=np.asarray(p,float);order=np.argsort(p);adjusted=np.minimum.accumulate((p[order]*len(p)/np.arange(1,len(p)+1))[::-1])[::-1];out=np.empty_like(p);out[order]=np.minimum(adjusted,1);return out

def table(path,required):
 try:
  with path.open(encoding='utf-8-sig') as header_file:header=next(csv.reader(header_file))
  if len(header)!=len(set(header)):raise InputError('CSV 列名不能重复')
  df=pd.read_csv(path,dtype={'chrom':str,'id':str,'sample':str})
 except Exception as e:raise InputError('无法读取 CSV，请使用 UTF-8 逗号分隔文件') from e
 if not set(required)<=set(df.columns) or not len(df) or df.columns.duplicated().any():raise InputError('缺少必填列或文件为空')
 if len(df)>100000 or len(df.columns)>2006:raise InputError('在线初版限 100,000 行和 2,000 个样本')
 return df

def positions(df):
 if df.chrom.isna().any() or not all(SAFE.fullmatch(str(x)) for x in df.chrom):raise InputError('染色体名只允许字母、数字、点、下划线和短横线')
 p=pd.to_numeric(df.pos,errors='coerce').to_numpy(float)
 if not np.isfinite(p).all() or (p<1).any() or (p%1!=0).any() or (p>2**31-1).any():raise InputError('坐标须为有效正整数，使用 1-based 坐标')
 df['pos']=p.astype(int)
 if df.duplicated(['chrom','pos']).any():raise InputError('检测到重复染色体坐标，请先规范化变异')

def plot_scan(df,value,path,label):
 fig,ax=plt.subplots(figsize=(10,3.7));offset=0;ticks=[];labels=[]
 for i,(chrom,g) in enumerate(df.groupby('chrom',sort=False)):
  g=g.sort_values('pos');x=g.pos.to_numpy()+offset;ax.scatter(x,g[value],s=8,c=['#287665','#bd8854'][i%2],alpha=.8);ticks.append((x.min()+x.max())/2);labels.append(str(chrom));offset=x.max()+100000
 ax.set(xticks=ticks,xticklabels=labels,xlabel='Chromosome',ylabel=label);ax.spines[['top','right']].set_visible(False);fig.tight_layout();fig.savefig(path,dpi=160);plt.close(fig)

def bsa(input_dir,out,config):
 df=table(input_dir/'counts.csv',['chrom','pos','ref_high','alt_high','ref_low','alt_low']);positions(df)
 cols=['ref_high','alt_high','ref_low','alt_low'];values=df[cols].apply(pd.to_numeric,errors='coerce').to_numpy(float)
 if not np.isfinite(values).all() or (values<0).any() or (values%1!=0).any() or (values>10000000).any():raise InputError('等位计数必须为 0–10,000,000 的整数，不能缺失')
 df[cols]=values.astype(int);depth_min=int(config.get('minDepth',10));window=int(config.get('windowBp',1000000))
 if not 1<=depth_min<=10000 or not 100<=window<=100000000:raise InputError('深度或窗口参数超出范围')
 df['depth_high']=df.ref_high+df.alt_high;df['depth_low']=df.ref_low+df.alt_low
 total=len(df);df=df[(df.depth_high>=depth_min)&(df.depth_low>=depth_min)].copy()
 if not len(df):raise InputError('深度过滤后没有可分析位点')
 df['snp_index_high']=df.alt_high/df.depth_high;df['snp_index_low']=df.alt_low/df.depth_low;df['delta_snp_index']=df.snp_index_high-df.snp_index_low
 df['p_read_count']= [fisher_exact([[int(r.ref_high),int(r.alt_high)],[int(r.ref_low),int(r.alt_low)]]).pvalue for r in df.itertuples()]
 df['q_read_count_bh']=bh(df.p_read_count);df.sort_values(['chrom','pos']).to_csv(out/'variants.csv',index=False)
 df['window_start']=((df.pos-1)//window)*window+1
 win=df.groupby(['chrom','window_start'],sort=False).agg(n_variants=('pos','size'),mean_delta=('delta_snp_index','mean')).reset_index();win['window_end']=win.window_start+window-1;win.to_csv(out/'windows.csv',index=False)
 plot_scan(df,'delta_snp_index',out/'delta-index.png','Delta SNP-index (high - low)')
 return dict(method='bsa.delta.v1',inputVariants=total,retainedVariants=len(df),windows=len(win),warnings=['探索性混池读段频率对比；不代表生物学重复或已校准的分离群体检验。','Fisher/BH 仅描述读段计数差异，不提供 QTL 置信区间、因果基因或 PIP。','尚未建模池个体数、倍性分离、测序偏倚与 LD；多倍体 CausalBSA 仍待验证。'])

def command(args,out):
 with (out/'commands.jsonl').open('a') as log:log.write(json.dumps(args)+'\n')
 p=subprocess.run(args,capture_output=True,text=True,timeout=600)
 with (out/'execution.log').open('a') as log:log.write(p.stdout+'\n'+p.stderr+'\n')
 if p.returncode:raise InputError('分析软件未完成计算，请检查输入、样本匹配与质控；详细日志保留在任务记录中')

def gwas(input_dir,out,config):
 if int(config.get('ploidy',2))!=2:raise InputError('此 PLINK 线性基线仅支持二倍体整数剂量；多倍体请等待独立验证的适配器')
 df=table(input_dir/'genotypes.csv',['id','chrom','pos','ref','alt']);positions(df)
 if df.id.isna().any() or df.id.duplicated().any() or not all(SAFE.fullmatch(str(x)) for x in df.id):raise InputError('变异 ID 必须唯一且只能包含字母、数字、点、下划线、短横线')
 if not all(str(r) in 'ACGT' and len(str(r))==1 and str(a) in 'ACGT' and len(str(a))==1 and r!=a for r,a in zip(df.ref,df.alt)):raise InputError('仅支持 A/C/G/T 双等位 SNP；ref 与 alt 必须不同')
 samples=[c for c in df.columns if c not in ['id','chrom','pos','ref','alt']]
 if not 12<=len(samples)<=2000 or len(df)<5 or not all(SAFE.fullmatch(s) for s in samples):raise InputError('需要 12–2000 个合法样本 ID 和至少 5 个 SNP')
 dosage=df[samples].apply(pd.to_numeric,errors='raise').to_numpy(float)
 if np.isinf(dosage).any() or not np.isin(dosage[~np.isnan(dosage)],[0,1,2]).all():raise InputError('二倍体剂量只接受 0/1/2；缺失请留空')
 ph=table(input_dir/'phenotypes.csv',['sample','trait']);ph['sample']=ph['sample'].astype(str)
 if ph['sample'].duplicated().any() or set(ph['sample'])!=set(samples):raise InputError('表型样本与基因型样本必须完全一致且不重复')
 ph=ph.set_index('sample').loc[samples];y=pd.to_numeric(ph.trait,errors='coerce').to_numpy(float)
 if not np.isfinite(y).all() or len(np.unique(y))<3:raise InputError('此基线只支持无缺失的连续性状，至少三个不同取值')
 maf=float(config.get('maf',.05));pcs=int(config.get('pcs',2))
 if not 0<maf<.5 or not 1<=pcs<=5 or len(samples)<=pcs+5:raise InputError('MAF 必须介于 0 与 0.5，PC 数为 1–5')
 work=out/'plink';work.mkdir()
 with (work/'input.tfam').open('w') as f:
  for s,t in zip(samples,y):f.write(f'{s} {s} 0 0 0 {t}\n')
 with (work/'input.tped').open('w') as f:
  for i,row in enumerate(df.itertuples()):
   alleles=[]
   for d in dosage[i]:alleles.extend(['0','0'] if np.isnan(d) else [row.ref,row.ref] if d==0 else [row.ref,row.alt] if d==1 else [row.alt,row.alt])
   chrom=str(row.chrom);chrom=chrom[3:] if chrom.lower().startswith('chr') else chrom
   f.write(f'{chrom} {row.id} 0 {row.pos} '+ ' '.join(alleles)+'\n')
 with (work/'alt.txt').open('w') as f:
  for row in df.itertuples():f.write(f'{row.id} {row.alt}\n')
 base=['plink1.9','--allow-extra-chr','--allow-no-sex','--threads','1','--memory','768']
 qc=str(work/'qc');pruned=str(work/'pruned');pca=str(work/'pca');assoc=str(work/'association')
 command(base+['--tfile',str(work/'input'),'--make-bed','--maf',str(maf),'--geno','0.1','--mind','0.1','--keep-allele-order','--out',qc],out)
 command(base+['--bfile',qc,'--indep-pairwise','50','5','0.2','--out',pruned],out)
 if len(Path(pruned+'.prune.in').read_text().splitlines())<pcs+1:raise InputError('LD 剪枝后位点不足，不能可靠计算指定 PC 数')
 command(base+['--bfile',qc,'--extract',pruned+'.prune.in','--pca',str(pcs),'--out',pca],out)
 command(base+['--bfile',qc,'--covar',pca+'.eigenvec','--linear','hide-covar','--a1-allele',str(work/'alt.txt'),'2','1','--out',assoc],out)
 result=pd.read_csv(assoc+'.assoc.linear',sep=r'\s+');result=result[result.TEST=='ADD'].copy();result['P']=pd.to_numeric(result.P,errors='coerce');result=result[np.isfinite(result.P)&(result.P>=0)&(result.P<=1)]
 if not len(result):raise InputError('没有有效关联结果；请检查模型自由度、变异和表型')
 result['q_bh']=bh(result.P);result['bonferroni_threshold']=.05/len(result);result.to_csv(out/'associations.csv',index=False)
 plot=result.rename(columns={'CHR':'chrom','BP':'pos'});plot['minus_log10_p']=-np.log10(np.maximum(plot.P,1e-300));plot_scan(plot,'minus_log10_p',out/'manhattan.png','-log10(P)')
 fig,ax=plt.subplots(figsize=(4,4));observed=-np.log10(np.maximum(np.sort(result.P),1e-300));expected=-np.log10((np.arange(len(result))+.5)/len(result));ax.scatter(expected,observed,s=10,c='#287665');m=max(expected.max(),observed.max());ax.plot([0,m],[0,m],c='#999',lw=1);ax.set(xlabel='Expected -log10(P)',ylabel='Observed -log10(P)');fig.tight_layout();fig.savefig(out/'qq.png',dpi=160);plt.close(fig)
 return dict(method='gwas.plink-linear.v1',inputSamples=len(samples),retainedSamples=len(Path(qc+'.fam').read_text().splitlines()),inputVariants=len(df),testedVariants=len(result),pcs=pcs,warnings=['二倍体、连续性状的探索性线性回归，含 LD 剪枝后 PCA 协变量；不是亲缘矩阵混合模型。','强亲缘关系、多倍体、二分类性状、稀有变异需使用另行验证的方法。','群体结构校正不保证消除全部混杂；关联信号不等于因果基因。'])

EXECUTORS={'bsa.delta.v1':bsa,'gwas.plink-linear.v1':gwas}

def run(method,input_dir,out,config):
 out.mkdir(parents=True,exist_ok=False);started=time.time()
 result=EXECUTORS.get(method)
 if result is None:raise InputError('算法未列入执行白名单')
 summary=result(input_dir,out,config);summary['runtimeSeconds']=round(time.time()-started,3)
 manifest=dict(schemaVersion=1,method=method,implementationSHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),runtimeImage=os.getenv('OMICS_RUNTIME_IMAGE','development'),config=config,inputFiles={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in input_dir.iterdir() if p.is_file()},summary=summary)
 (out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 for source in ['/opt/omics/system-packages.tsv','/opt/omics/python-packages.txt']:
  p=Path(source)
  if p.exists():(out/p.name).write_bytes(p.read_bytes())
 # Exclude raw genotypes, phenotypes and intermediate binary datasets from downloadable results.
 import shutil
 if (out/'plink').exists():
  for p in (out/'plink').iterdir():
   if p.suffix not in ['.log','.eigenval']:p.unlink()
 (out/'README.txt').write_text('KeyanTong exploratory analysis\n'+'\n'.join(summary['warnings'])+'\nSee manifest.json for parameters, input checksums and environment versions.\n')
 return summary

def main():
 p=argparse.ArgumentParser();p.add_argument('--method',required=True);p.add_argument('--input',required=True);p.add_argument('--output',required=True);p.add_argument('--config',default='{}');a=p.parse_args()
 try:run(a.method,Path(a.input),Path(a.output),json.loads(a.config))
 except (InputError,ValueError) as e:print(json.dumps({'error':str(e)},ensure_ascii=False));raise SystemExit(2)
if __name__=='__main__':main()
