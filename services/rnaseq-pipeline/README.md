# RNAseq 一键下游分析

用户只需提供：

1. **表达矩阵**（gene × samples，CSV/TSV）
2. **分组配置**：
   - 旧式 CSV：`sample,group`
   - 或 JSON：`groups[{id,name,role,color,samples}]` + `options`（阈值 / 图种 / 维恩模式）

流水线自动：多对比差异分析、按组色 PCA、火山图、热图、上调/下调维恩与多组维恩，并打包。无物种注释时跳过 GO/KEGG。

## CLI

```bash
cd services/rnaseq-pipeline
# 两分组 CSV
python3 -m keyantong_rnaseq \
  --matrix fixtures/tiny_matrix.csv \
  --groups fixtures/tiny_groups.csv \
  --outdir /tmp/rnaseq-out --species none

# 多组 + 颜色 + 维恩
python3 -m keyantong_rnaseq \
  --matrix fixtures/tiny_matrix.csv \
  --groups fixtures/tiny_analysis.json \
  --outdir /tmp/rnaseq-multi --species none
```

## 冒烟测试

```bash
./smoke.sh
```

覆盖：legacy 两分组 + 多组 JSON（要求 `venn_multi_*.png` 与 ≥2 contrasts）。
