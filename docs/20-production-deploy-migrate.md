# 20 · 生产部署与整机迁移（keyantong.online）

**状态：** Accepted  
**范围：** MVP 生产 —— Caddy + Portal + Postgres + Redis（可选 profile：`rnaseq-worker`）  
**原则：** NCBI 大数据仍用户本机直传；分析可在本云主机 worker 跑；一个月后可整包迁机。

## 1. 服务器布局

| 路径 | 用途 |
|------|------|
| `/opt/keyantong` | 代码与 `infra/`（Compose、Caddyfile、`.env`） |
| `/data/keyantong/pg` | Postgres 数据目录 |
| `/data/keyantong/redis` | Redis |
| `/data/keyantong/portal` | 门户 file-backed（用户、社区帖、轻量 job 元数据） |
| `/data/keyantong/caddy` | ACME 证书 |
| `/data/keyantong/rnaseq/` | 上游/下游分析数据（见 [21](./21-rnaseq-upstream-worker.md)） |
| `/data/keyantong/backups` | `backup.sh` 输出 |

Compose：`infra/docker-compose.prod.yml`  
密钥：`infra/.env`（**永不进 Git**；模板 `infra/.env.example`）

## 2. 首次上线

1. 安装 Docker Engine + Compose plugin；防火墙仅 **22 / 80 / 443**。
2. 创建 `/data/keyantong/...` 与 `/opt/keyantong`。
3. 同步仓库必要文件（排除 `node_modules`、`.next`、`.venv`、大 annotations tsv、pptx）。
4. 从 `infra/.env.example` 生成强随机密钥的 `infra/.env`；`NCBI_ALLOW_SERVER_ASCP=0`。
5. `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build`
6. 验证 `https://keyantong.online/api/health`。

可选启用分析 worker：`--profile rnaseq-worker`（需足够磁盘；见文档 21）。

## 3. 备份 / 恢复 / 迁机

```bash
/opt/keyantong/infra/backup/backup.sh
/opt/keyantong/infra/backup/restore.sh /data/keyantong/backups/<stamp>
```

迁机：旧机 backup → 新机装 Docker + 同步 `/opt/keyantong` → restore → 切 DNS → 确认健康 → 关旧机。  
`rnaseq/incoming` 默认不进备份（体量大）；迁机时请单独 `rsync` 未完成作业。

## 4. 安全

- SSH 密码与 `infra/.env` 不进仓库。
- Postgres/Redis 不对公网映射。
- `INTERNAL_API_SECRET` 必填。

## 5. MVP 限制

- NodeBB/RAG/Bridge 默认未启。
- 上游 FASTQ 流水线以 worker 骨架落地，完整比对索引需按文档 21 挂载 `refs/`。
