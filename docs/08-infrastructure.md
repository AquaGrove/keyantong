# 08 · 基础设施与部署

**状态：** Accepted  
**版本：** v0.1

## 1. 环境与域名

| 环境 | 域名示例 | 用途 |
|------|----------|------|
| local | localhost | 开发 |
| staging | `staging.keyantong.com` | 预发 |
| prod | `keyantong.com` / `bbs.` / `api.` | 生产 |

国内用户为主时：**生产主站必须走可备案的国内节点**（若使用需备案域名）。

## 2. MVP 服务器规格

### 2.1 推荐起步（已选定 NodeBB）

| 组件 | 规格 |
|------|------|
| 论坛 NodeBB + 反代 | 国内轻量 **2 核 4G**，80G SSD，3–5M（见 ADR-001） |
| 若未来评估 Discourse | 需升至 **2 核 8G**（当前不采用） |

操作系统：**Ubuntu 22.04 LTS**。  
LLM：**外部 API，不购买 GPU**。

门户可放 Zeabur；论坛与数据库放国内 VPS（见 ADR-005）。

### 2.2 内存经验分配（2C8G 单机示例）

| 进程 | 内存 |
|------|------|
| OS + 余量 | ~1G |
| 论坛 | 2–3.5G |
| PostgreSQL | 1–1.5G |
| Redis | 256–512M |
| Portal / 反代 | 512M–1G |
| rag-service | 1–2G |

OOM 时优先砍 RAG 或把 Portal 迁到 Zeabur。

### 2.3 成长期拆分

| 机器 | 规格 | 承载 |
|------|------|------|
| 业务机 | 2–4C / 4–8G | 论坛、PG、Redis、反代 |
| 算力机 | 4–8C / 8–16G | RAG、Analysis Worker |
| GPU | 按需 | 自托管模型（后期） |

附件与 Job IO **必须**走对象存储，避免撑爆系统盘。

## 3. Docker Compose 逻辑拓扑（MVP）

```text
infra/docker-compose.yml
  services:
    caddy | nginx
    forum
    postgres
    redis
    portal          # 或外部 Zeabur
    rag-api
    # analysis-api / worker   # 成长期启用
```

原则：

- 单 `docker network`  
- 密钥用 `.env`（不进 Git）  
- 数据卷：`pgdata` `redisdata` `forum_uploads`  

## 4. Zeabur 使用建议

| 放 Zeabur | 放国内 VPS |
|-----------|------------|
| Next.js 门户 | 论坛、PostgreSQL、Redis |
| 无状态 API（可选） | 需低延迟写库的服务 |
| Preview 环境 | 备案域名解析主站 |

注意：数据库跨公网连接要 SSL + IP 白名单；MVP 更建议 **DB 与论坛同机**。

### 4.1 本地 → GitHub → Zeabur（当前主流程）

1. 本机开发：`pnpm --dir apps/portal dev`
2. `git push origin main` 到 https://github.com/AquaGrove/keyantong
3. Zeabur 项目中 **Git 部署** 该仓库；根目录已有 `zbpack.json`：

```json
{ "app_dir": "apps/portal" }
```

4. 在 Zeabur 服务设置中确认 Root Directory / App Dir 指向门户；绑定域名后即可公网访问。
5. 论坛与数据库仍按 ADR-005 放国内更大规格机器；当前新加坡 2C2G 先跑门户即可。

## 5. 对象存储与 CDN

- Bucket 分离：`static` / `uploads` / `analysis`  
- 分析上传用 **预签名 URL**，API 不中转大文件  
- 公共静态走 CDN；私有产物带过期签名  

## 6. TLS 与证书

- 生产全站 HTTPS  
- Caddy 自动证书或云厂商证书  
- 仅内网端口暴露 DB/Redis  

## 7. 密钥与配置

| 配置 | 存放 |
|------|------|
| `DATABASE_URL` | 服务器环境变量 / 密钥管理 |
| `REDIS_URL` | 同上 |
| `LLM_API_KEY` | 同上，仅 rag 服务可见 |
| `FORUM_WEBHOOK_SECRET` | 同上 |
| `OSS_*` | 同上 |

**禁止**把生产密钥写入仓库、文档示例、客户端。

## 8. 备份

| 项 | 频率 | 保留 |
|----|------|------|
| PostgreSQL 逻辑备份 | 每日 | ≥ 14 天 |
| 论坛上传 | 每日或实时同步 OSS | ≥ 14 天 |
| 备份恢复演练 | 每季度 | 记录在 Runbook |

## 9. 监控与告警（MVP 最小集）

- Uptime：门户、论坛、`/healthz`  
- 磁盘 > 80%、内存 OOM、证书到期  
- RAG：错误率、P95 延迟、日费用  
- 分析：队列堆积、失败率  

日志：JSON 结构化；含 `request_id`；禁止记录完整密钥与用户密码。

## 10. 发布策略

1. staging 验证  
2. 数据库迁移向前兼容  
3. 滚动/短停机更新（论坛按上游指南）  
4. 健康检查通过后切流量  
5. 失败按 [Runbook](./13-runbook.md) 回滚  

## 11. 成本控制清单

- 新用户云厂商轻量优惠  
- LLM 设日预算告警  
- 大文件不上系统盘  
- 闲时关掉 staging GPU（若有）  
