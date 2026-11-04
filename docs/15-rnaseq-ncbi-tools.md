# 15 · 转录组一键分析与 NCBI 上传协助

**状态：** Draft / DE 多引擎 + 异步 Job + KEGG + Portal checklist  
**版本：** v0.4  
**更新：** 2026-11-04（Asia/Shanghai）

## 产品约定

### 转录组下游

- **用户只提供**：表达矩阵 + 分组配置（色卡/拖拽）+ 勾选对比 + 可选物种。
- **系统自动**：差异分析、PCA、火山图、热图、灵活维恩、GO/KEGG（有本地映射时）、ZIP。
- **DE 引擎**
  - `auto`：本机有 R+limma 时走 `r_limma`，否则 `limma_like` → `welch`
  - `r_limma` / `r_edger` / `r_deseq2`：Rscript + Bioconductor（缺包则失败并回退顺序）
  - `limma_like` / `welch`：纯 Python
  - `pydeseq2`：可选 `pip install 'pydeseq2>=0.4'`（需 counts）
  - 结果写入 `tables/methods.json`（含 `engine_catalog`）
- **注释**：`annotations/<species>/gene2go.tsv` 与 `gene2kegg.tsv`；`demo` 夹具已内置；human/mouse 用 `services/rnaseq-pipeline/scripts/fetch_annotations.sh` 本机拉取（TSV gitignore，见 `annotations/README.md`）。
- **维恩**：2–4 集互斥区标注；CSV（regions/presence）为权威。
- **Job**：门户 POST 入队（202）→ GET 轮询 status → 下载 ZIP（文件型异步，非独立 worker 集群）。

```bash
cd services/rnaseq-pipeline && ./smoke.sh
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

### NCBI SRA 上传协助

- **架构（硬约束）**：大数据**不经**科研通服务器；门户只做元数据校验 + 生成本地 ascp 命令/助手脚本；用户本机 ascp 直连 NCBI。详见 [19 · 本机直连架构](./19-ncbi-local-upload-architecture.md)。
- **密钥仅路径**，内容不落库；API 拒绝文件 multipart / 超大 body。
- **Submission Portal 网页代填 / 自动提交 = 明确不做**；checklist 跟踪人工步骤。
- 服务器端 ascp Job：**已禁用**（历史任务只读）。

```bash
cd services/ncbi-upload && PYTHONPATH=. python3 -m unittest discover -s tests -v
```

## 诚实边界

| 能力 | 状态 |
|------|------|
| 矩阵+多组+对比勾选 → 全自动下游 ZIP | 已自动化 |
| R limma（本机已装时） | 已接；edgeR/DESeq2 探测并接线，本机未装则不可用 |
| Python limma_like / Welch / 可选 pydeseq2 | 已接 |
| GO + KEGG（本地 TSV） | demo 可跑；human/mouse 需自备映射 |
| 异步 Job 轮询（rnaseq/ncbi） | 文件型本地队列；非云端 worker |
| NCBI 校验 + 本地命令/助手包 | 已接（服务器不跑 ascp） |
| 用户本机 ascp 直连 NCBI | CLI/脚本；需自装 Aspera |
| Portal 网页自动填表提交 | **不做**（checklist 仅跟踪） |

相关：[16 · 轻量云](./16-lightweight-cloud-sizing.md) · [19 · NCBI 本机直连](./19-ncbi-local-upload-architecture.md)
