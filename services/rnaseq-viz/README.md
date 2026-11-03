# rnaseq-viz

转录组下游分析的命令行，也是门户作业的 worker 入口。一次调用只吃两类输入：

1. 基因表达矩阵：基因 × 样本，TPM 或 FPKM，CSV/TSV
2. 分组：哪些列是对照，哪些列是处理组（最多 3 个处理组，每组至少 2 个重复）

不读取差异基因表、GO 表或预先画好的图。

## 自动步骤

`python3 -m rnaseq_viz run` 按顺序做完这些阶段：

| 阶段 | 做什么 | 产物 |
|------|--------|------|
| QC | `log2(x+1)`，去掉零方差基因 | `normalized.tsv`、`qc_summary.json` |
| DE | 每个处理组相对对照做 Welch t 检验，BH padj | `de_<组>_vs_control.tsv` |
| PCA | 对 log 矩阵按基因做 z-score 后的主成分 | `pca.png` / `pdf` / `svg`、得分表 |
| 火山图 | \|log2FC\| ≥ 1 且 padj ≤ 0.05 着色 | `volcano_<组>_vs_control.svg/png` |
| 热图 | 显著基因的行向 z-score | `heatmap.svg` / `png` |
| 韦恩图 | 两个及以上处理组时，显著基因的交集 | `venn.svg`、`venn_membership.tsv` |
| GO/KEGG | 用物种 GMT 做超几何检验；库不在就写明失败 | `enrichment_status.json`、气泡图 |
| 打包 | 以上文件打进一个 zip | `results.zip`、`analysis_summary.json` |

门户 `/tools/rnaseq` 在 `isEntitled`（校园邮箱已验证，试用未过期或永久会员）之后同步执行同一条命令。没有第二套用户库。队列 worker 以后也应执行这条命令，而不是另一套脚本。

## 本地冒烟

```bash
cd services/rnaseq-viz
python3 -m unittest discover -s tests -v
```

`tests/test_pipeline.py` 用一份很小的对照/处理矩阵，检查差异方向、PCA、火山图和热图都写出来；两组处理时再检查韦恩图和迷你 GO 库。

手跑示例：

```bash
python3 -m rnaseq_viz run \
  --matrix examples/expression_matrix.tsv \
  --control WT1,WT2,WT3 \
  --treat MUT=MUT1,MUT2,MUT3 \
  --out-dir /tmp/keyantong-rnaseq \
  --species none
```

`examples/sample_metadata.tsv` 只给旧的 `pca` 子命令用，产品路径不读它。

## 物种注释库

GO/KEGG 不接受用户上传的富集表。把 GMT 放到：

```text
annotations/<species>/go.gmt
annotations/<species>/kegg.gmt
```

或设置 `RNASEQ_ANNOTATION_DIR` 指向含 `<species>/` 的目录。GMT 以制表符分隔：`名称、描述、基因 ID…`，ID 要和矩阵一致。门户物种取值为 `arabidopsis`、`human`、`mouse`。文件不在时，`enrichment_status.json` 写清楚失败原因，差异分析和图仍然输出。

测试夹具在 `tests/fixtures/annotations/demo/`，不是生产注释。

## NCBI SRA

```bash
python3 -m rnaseq_viz ncbi \
  --biosample biosample.tsv \
  --sra sra.tsv \
  --email submitter@example.edu \
  --account account-folder \
  --preload preload-1 \
  --key-path /绝对路径/key \
  --data-dir /绝对路径/fastq \
  --out-dir /tmp/sra-plan
```

校验 BioSample / SRA 必填列、样本对齐和 fastq.gz|bz2 文件名，并写出 `upload.sh`。`--execute` 只在本机有 `ascp` 时上传。门户调用时带 `--report-only`，不把邮箱和私钥路径写入磁盘，也不执行 ascp。

## Docker

```bash
docker build -t keyantong-rnaseq-viz services/rnaseq-viz
docker run --rm -v "$PWD/out:/out" -v "$PWD/matrix.tsv:/matrix.tsv:ro" keyantong-rnaseq-viz \
  run --matrix /matrix.tsv --control A,B --treat treat=C,D --out-dir /out --species none
```

镜像不含 R，也不含物种注释库。`R/plot_pca.R` 只是可选的单图脚本，不是这条产品路径。
