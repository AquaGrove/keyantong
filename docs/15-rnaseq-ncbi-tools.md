# 15 · 转录组一键分析与 NCBI 上传协助

**状态：** Draft / 首批切片已落地  
**版本：** v0.1

## 产品约定

### 转录组下游

- **用户只提供**：表达矩阵（gene × samples）+ 对照/实验分组。
- **系统自动**：差异分析、PCA、火山图、上下调对照、热图；有物种注释时再跑 GO/KEGG；打包 ZIP。
- **不要**把已算好的 DEG/GO 表当作主路径必填输入。

实现：`services/rnaseq-pipeline`（CLI）+ 门户 `/tools/rnaseq`（会员权益门禁，本地同步 job runner）。

```bash
cd services/rnaseq-pipeline && ./smoke.sh
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
| 矩阵+分组 → DEG/PCA/火山图/热图/上下调对照/ZIP | 已自动化（Welch t + BH；非完整 limma/DESeq2） |
| GO/KEGG | 无注释时跳过并写明；物种库未内置 |
| 门户一键跑 | 已接本地同步 runner；未接独立异步 worker/队列 |
| NCBI 校验 + ascp 命令 | 已自动化 |
| 代用户执行 ascp / 保管私钥 | **不做**（本机用户执行） |

## 工具卡

- `catalog/tools/rnaseq-oneclick.yaml`
- `catalog/tools/ncbi-sra-upload.yaml`
