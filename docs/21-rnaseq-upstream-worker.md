# 21 · 上游 RNAseq Worker 架构（≤80GB / 单机可迁移）

**状态：** Accepted（骨架已进 Compose profile；完整 FASTQ→定量流水线逐步接）  
**边界：**

| 场景 | 数据路径 | 谁跑 |
|------|----------|------|
| NCBI SRA/提交上传 | 用户本机 → NCBI（ascp） | **不经**科研通服务器 |
| 下游 DE（矩阵+分组） | 浏览器上传小矩阵 → portal/`DATA_DIR` 或 worker | 现有 `keyantong_rnaseq` |
| **上游**（FASTQ→定量→矩阵） | 用户直传本机数据盘或对象存储 → **本机 worker** | `rnaseq-worker` |

门户**不**把原始测序大文件中转到弱机器；分析就在用户购买的这台（或日后迁过去的）分析服务器上完成。

## 1. 目录约定（均在 `KEYANTONG_DATA_ROOT`）

```
/data/keyantong/rnaseq/
  incoming/<userOrJobId>/   # 用户 scp/rsync/直传落地（原始 FASTQ）
  jobs/<jobId>/             # 工作区：fastq 软链、中间 bam/quant、日志
  results/<jobId>/          # 对外可下载的矩阵/报告/zip
  refs/                     # 基因组/转录本索引（只读挂载，迁机单独打包）
```

门户元数据仍可写 `/data/keyantong/portal`（job 状态 JSON）；大文件只出现在 `rnaseq/`。

## 2. 配额与排队（单机护栏）

| 项 | 默认 | 环境变量 |
|----|------|----------|
| 单作业输入+中间上限 | **80 GiB** | `RNASEQ_JOB_MAX_BYTES` |
| 同时跑作业数 | 1 | `RNASEQ_MAX_CONCURRENT` |
| 排队长度 | 8 | `RNASEQ_QUEUE_MAX` |
| 磁盘水位（`rnaseq` 所在文件系统） | 使用率 ≥ 85% 拒收新作业 | `RNASEQ_DISK_WATERMARK` |

超限：拒绝创建 / 杀掉作业并标记 `failed_quota`，不静默占满盘。

## 3. 接入方式（MVP）

1. **下游（已有）**：`/tools` 矩阵+分组 → portal API →（可选）同一 worker 调 `python -m keyantong_rnaseq`。
2. **上游（骨架）**：
   - 用户用 `scp`/`rsync` 把 FASTQ 放到 `incoming/<id>/`，或后续浏览器直传至同路径；
   - 门户登记 job（样本表、物种、比对器选型）；
   - worker 轮询 Redis/目录队列，校验体积后跑对齐/定量（下一步接 salmon/kallisto 等）；
   - 产出 count 矩阵写入 `results/`，可一键转入下游 DE。

Compose：`docker compose ... --profile rnaseq-worker up -d`  
镜像：`services/rnaseq-worker/Dockerfile`（先含 Python 下游包；FASTQ 工具按需多层安装，避免无脑塞进 portal 镜像）。

## 4. 与迁机的关系

- `refs/` 与未完成 `incoming/`/`jobs/` 体量大：backup.sh **默认排除 incoming**；迁机用 `rsync -aHAX` 另拷。
- `results/` + portal 元数据进常规备份即可恢复「已完成分析」。

## 5. 下一步（未本轮强制完成）

1. 样本 sheet 校验 API + 上传凭证（预签名或本机 rsync 说明页）。
2. salmon/kallisto + 参考索引拉取脚本 → `refs/`。
3. 将 portal `rnaseq-jobs` 调度改为 Redis 队列，worker 消费（替代进程内 spawn）。
4. 监控：磁盘、作业时长、失败原因面板。
