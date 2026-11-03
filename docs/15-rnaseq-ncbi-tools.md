# 15 · 转录组一键分析与 NCBI 上传协助

**状态：** Draft / 精细化交互 + DE/富集/本机 ascp 切片  
**版本：** v0.3  
**更新：** 2026-11-04（Asia/Shanghai）

## 产品约定

### 转录组下游

- **用户只提供**：表达矩阵（gene × samples）+ **分组配置**（页面卡片或 CSV/JSON）+ **勾选要跑的对比**。
- **分组模型**：`groups[] = { id, name, role: control|treatment|custom, color, samples[] }`。
  - 支持拖拽/点击分配样本；每组可改名称、角色、展示色。
- **对比**：门户「对比选择」为真实开关；仅勾选的 control×treatment 对比会写入 `options.contrasts` 并运行。
- **系统自动**：按勾选对比做差异分析、PCA、火山图、热图、灵活维恩；物种有本地注释时跑 GO；打包 ZIP（含 `methods.json`）。
- **DE 引擎**：默认 `limma_like`（经验贝叶斯 moderated t）；可显式 `welch` / `pydeseq2`（需安装且为 counts）；结果写入 `tables/methods.json`。
- **绘图**：可调标题、DPI、色盲友好色板；默认导出 PNG+PDF+SVG。
- **维恩**：2–4 集合标注**互斥区域**精确计数；>4 退化为 set size + exclusive intersection 条形图，并输出 presence/regions CSV。
- **不要**把已算好的 DEG/GO 表当作主路径必填输入。

实现：`services/rnaseq-pipeline` + 门户 `/tools/rnaseq`。

```bash
cd services/rnaseq-pipeline && ./smoke.sh
# 指定物种 demo（内置夹具注释）
PYTHONPATH=. python3 -m keyantong_rnaseq \
  --matrix fixtures/tiny_matrix.csv \
  --groups fixtures/tiny_analysis.json \
  --outdir /tmp/rnaseq-out --species demo
```

### NCBI SRA 上传协助

- **用户只提供**：BioProject/BioSample/文库必要字段、文件清单、本机 ascp 密钥绝对路径与 uploads 目标。
- **系统自动**：字段校验、文件名对账、清单与 ascp 命令生成；**可选本机 dry-run / 执行 ascp**（写 `status.json` + `ascp_progress.log`）。
- **密钥**：仅路径进入请求与命令；禁止密钥内容上传；日志不写入私钥内容。
- **仍未做**：Submission Portal 网页自动填表提交、跨机器代传。

实现：`services/ncbi-upload`（validate + runner）+ 门户 `/tools/ncbi-upload` + `/api/tools/ncbi-validate` + `/api/tools/ncbi-run`。

```bash
cd services/ncbi-upload && PYTHONPATH=. python3 -m unittest discover -s tests -v
# dry-run（需本机路径真实存在才会完全通过文件检查）
PYTHONPATH=. python3 -m keyantong_ncbi --payload /path/payload.json --outdir /tmp/ncbi-out --dry-run
```

## 诚实边界（当前切片）

| 能力 | 状态 |
|------|------|
| 矩阵 + 多组色卡/拖拽 + **可勾选对比** → DEG/PCA/火山图/热图/灵活维恩/ZIP | 已自动化 |
| DE：`limma_like`（默认）/ Welch / 可选 pydeseq2 | 已接；**非** Bioconductor limma/DESeq2 本体 |
| GO 富集 | `species=demo` 内置夹具可跑；human/mouse 等需本地 `annotations/<sp>/gene2go.tsv`；KEGG 未内置 |
| 图：标题/DPI/色盲色板/SVG+PDF | 已接 |
| 维恩 2–4 精确互斥区；>4 Upset 风格条形 | 已接 |
| 门户一键跑 | 本地同步 runner；未接独立异步 worker/队列 |
| NCBI 校验 + ascp 命令 | 已自动化 |
| NCBI 本机 dry-run / 执行 ascp + status/log | 已接（同机本地模式） |
| Portal 网页代填提交 / 保管私钥 | **不做** |

## 工具卡

- `catalog/tools/rnaseq-oneclick.yaml`
- `catalog/tools/ncbi-sra-upload.yaml`
