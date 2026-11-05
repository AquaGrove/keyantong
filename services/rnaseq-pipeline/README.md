# RNAseq 一键下游分析

用户只需：**表达矩阵** + **分组/对比配置**（色卡、拖拽、阈值、维恩、DE 引擎）。

流水线自动：DE（优先本机 R limma，否则 Python limma_like）、PCA/火山图/热图/维恩、GO+KEGG（本地 annotations）、methods.json、ZIP。

## 本机环境（开发机）

```bash
# Python 3.11 venv（含 pydeseq2）
/opt/homebrew/bin/python3.11 -m venv .venv
.venv/bin/pip install -U pip
.venv/bin/pip install -e '.[deseq]'

# R Bioconductor DE（已装可跳过）
# BiocManager::install(c("limma","edgeR","DESeq2"), ask=FALSE, update=FALSE)

# 人类/小鼠注释（大文件，gitignore）
./scripts/fetch_annotations.sh

./smoke.sh
.venv/bin/python -m unittest discover -s tests -v
```

`smoke.sh` 会优先使用 `.venv/bin/python`。

注释放置与拉取见 `annotations/README.md`。引擎探测：

```bash
PYTHONPATH=. .venv/bin/python -c 'from keyantong_rnaseq.r_backends import engine_probe_report; import json; print(json.dumps(engine_probe_report(), indent=2))'
```

## DE engines

`de_engine=auto`：`r_limma` → `limma_like` → `welch`。  
可选 counts 引擎：`r_edger` / `r_deseq2` / `pydeseq2`。

轻量云规格见仓库 [`docs/16-lightweight-cloud-sizing.md`](../../docs/16-lightweight-cloud-sizing.md)。
