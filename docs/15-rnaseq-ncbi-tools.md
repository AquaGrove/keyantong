# 15 · 转录组一键分析与 NCBI 上传协助

**状态：** Draft / 多组个性化切片  
**版本：** v0.2

## 产品约定

### 转录组下游

- **用户只提供**：表达矩阵（gene × samples）+ **分组配置**（页面卡片或 CSV/JSON）。
- **分组模型**：`groups[] = { id, name, role: control|treatment|custom, color, samples[] }`。
  - 支持多个实验组相对主对照；每组可改名称、角色、展示色、样本芯片归属。
- **系统自动**：按对比做差异分析、PCA（按组色）、各对比火山图、热图、灵活维恩；有物种注释时再跑 GO/KEGG；打包 ZIP。
- **维恩模式（可多选）**：
  - `up_down_per_contrast`：每个对比的上调 vs 下调
  - `multi_group_up` / `multi_group_down` / `multi_group_deg`：多组集合维恩（↑ / ↓ / ↑∪↓）
- **阈值**：`|log2FC|`、`padj`、上/下调色可调；图种可开关。
- **不要**把已算好的 DEG/GO 表当作主路径必填输入。

实现：`services/rnaseq-pipeline`（CLI，兼容旧 CSV + 新 JSON）+ 门户 `/tools/rnaseq`（会员门禁，本地同步 job runner）。

```bash
cd services/rnaseq-pipeline && ./smoke.sh
# 多组
PYTHONPATH=. python3 -m keyantong_rnaseq \
  --matrix fixtures/tiny_matrix.csv \
  --groups fixtures/tiny_analysis.json \
  --outdir /tmp/rnaseq-out
```

### NCBI SRA 上传协助

- **用户只提供**：BioProject/BioSample/文库必要字段、文件清单、本机 ascp 密钥绝对路径与 uploads 目标。
- **系统自动**：字段校验、文件名对账、清单与 ascp 命令生成。
- **密钥**：仅路径进入请求；禁止密钥内容上传；不落库。

实现：`services/ncbi-upload`（Python 单测）+ 门户 `/tools/ncbi-upload` + `/api/tools/ncbi-validate`。

```bash
cd services/ncbi-upload && PYTHONPATH=. python3 -m unittest tests.test_validators -v
```

## 诚实边界（当前切片）

| 能力 | 状态 |
|------|------|
| 矩阵 + 多组卡片/JSON → 多对比 DEG/PCA/火山图/热图/灵活维恩/ZIP | 已自动化（Welch t + BH；非完整 limma/DESeq2） |
| 门户分组色卡 / 样本芯片 / 参数面板 | 已接 |
| GO/KEGG | 无注释时跳过并写明；物种库未内置 |
| 门户一键跑 | 本地同步 runner；未接独立异步 worker/队列 |
| 维恩 >4 集合 | 退化为条形图 + presence/membership CSV |
| NCBI 校验 + ascp 命令 | 已自动化 |
| 代用户执行 ascp / 保管私钥 | **不做**（本机用户执行） |

## 工具卡

- `catalog/tools/rnaseq-oneclick.yaml`
- `catalog/tools/ncbi-sra-upload.yaml`
