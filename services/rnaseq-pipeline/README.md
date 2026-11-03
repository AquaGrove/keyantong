# RNAseq 一键下游分析

用户只需提供：

1. **表达矩阵**（gene × samples，CSV/TSV）
2. **分组配置**：CSV `sample,group` 或 JSON（groups + options：对比勾选 / 阈值 / DE 引擎 / 图题·DPI·色板·导出格式 / 维恩模式）

流水线自动：按勾选对比做 `limma_like`（默认）差异分析、按组色 PCA、火山图、热图、精确 2–4 集维恩；`species=demo` 或本地 `annotations/<sp>/gene2go.tsv` 时跑 GO；写出 `methods.json` 并打包。

```bash
cd services/rnaseq-pipeline
./smoke.sh
PYTHONPATH=. python3 -m unittest discover -s tests -v
```
