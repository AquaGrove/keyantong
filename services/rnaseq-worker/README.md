# rnaseq-worker

单机分析 worker：消费门户登记的 RNAseq 作业，数据只读写 `/data/keyantong/rnaseq`。

- 下游：复用 `services/rnaseq-pipeline`（矩阵 DE）。
- 上游：FASTQ→定量（骨架；见 `worker.py` 与 docs/21）。

启动（生产）：

```bash
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env --profile rnaseq-worker up -d --build
```
