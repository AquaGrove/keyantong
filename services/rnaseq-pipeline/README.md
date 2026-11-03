# RNAseq 一键下游分析

用户只需：**表达矩阵** + **分组/对比配置**（色卡、拖拽、阈值、维恩、DE 引擎）。

流水线自动：DE（优先本机 R limma，否则 Python limma_like）、PCA/火山图/热图/维恩、GO+KEGG（本地 annotations）、methods.json、ZIP。

```bash
./smoke.sh
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

注释放置说明见 `annotations/README.md`。可选：`pip install 'pydeseq2>=0.4'`；R：`BiocManager::install(c("limma","edgeR","DESeq2"))`。


## DE engines (R / Bioconductor)

Preferred order for `de_engine=auto`: `r_limma` → `limma_like` → `welch`.
Optional count engines: `r_edger`, `r_deseq2`, `pydeseq2`.

Probe locally:

```bash
PYTHONPATH=. python3 -c 'from keyantong_rnaseq.r_backends import engine_probe_report; import json; print(json.dumps(engine_probe_report(), indent=2))'
```

Install (example, requires network):

```r
BiocManager::install(c("limma", "edgeR", "DESeq2"), ask = FALSE, update = FALSE)
```

On the developer Mac used for this branch (2026-11-04 Asia/Shanghai): limma / edgeR / DESeq2 installed successfully via BiocManager and are detected by unit tests. pydeseq2 remains optional and is not installed by default.

