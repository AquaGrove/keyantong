# 23 · 门户下游 DE → rnaseq-worker 交接

**状态：** Accepted  
**问题：** 生产门户镜像为 Node-only，无法在容器内 `python -m keyantong_rnaseq`。  
**方案：** 设置 `RNASEQ_DATA_ROOT=/data/rnaseq`（compose 已挂载共享卷）。`enqueueRnaseqJob` 把矩阵/分组写入 `/data/rnaseq/jobs/<id>/input/`，worker 消费 `kind=downstream`，结果 ZIP 在 `/data/rnaseq/results/<id>/rnaseq_results.zip`；门户 GET 时同步状态并镜像 ZIP 到 portal job `out/`。

上游 FASTQ 仍落 `incoming/`，状态 `pending_upstream`（比对器后续接入）。NCBI 大数据仍本机直传（`NCBI_ALLOW_SERVER_ASCP=0`）。
