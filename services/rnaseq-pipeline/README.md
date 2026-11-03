# RNAseq 一键下游分析

用户只需提供：

1. **表达矩阵**（gene × samples，CSV/TSV，TPM/FPKM/counts 均可）
2. **分组表**（`sample,group`，`group` 为 `control` / `treatment` 或自定义两组名）

流水线自动完成差异分析、PCA、火山图、上下调 Venn 风格对照、热图，并打包结果。无物种注释时跳过 GO/KEGG，并在结果中说明。

## CLI

```bash
cd services/rnaseq-pipeline
python3 -m keyantong_rnaseq \
  --matrix fixtures/tiny_matrix.csv \
  --groups fixtures/tiny_groups.csv \
  --outdir /tmp/rnaseq-out \
  --species none
```

## 冒烟测试

```bash
./smoke.sh
```

失败条件：缺少 DEG 表或任一必备图/包。
