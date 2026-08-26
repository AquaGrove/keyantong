# 09 · 本地开发指南

**状态：** Accepted  
**版本：** v0.2

## 1. 前置依赖

| 工具 | 版本建议 |
|------|----------|
| Git | 2.40+ |
| Docker Desktop / Docker Engine | 24+ |
| Node.js | 20 LTS |
| pnpm | 9+ |
| Python | 3.11+ |
| uv 或 poetry | 最新稳定 |

可选：`direnv`、`mkcert`。

## 2. 获取仓库

### 2.1 本地开发（当前主流程）

```bash
git clone https://github.com/AquaGrove/keyantong.git
cd keyantong
cp .env.example .env   # 设置 ADMIN_PASSWORD 等
pnpm install --ignore-scripts
pnpm --dir apps/portal dev   # 客户端 http://127.0.0.1:3000
pnpm --dir apps/admin dev    # 管理端 http://127.0.0.1:3001 （需口令）
```

| 应用 | 端口 | 受众 |
|------|------|------|
| `apps/portal` | 3000 | 全体用户（可部署 Zeabur） |
| `apps/admin` | 3001 | 仅站长本机（勿对公网暴露） |

改完客户端后：`git push origin main` → Zeabur 自动部署门户（见 `zbpack.json` 与 [08 基础设施](./08-infrastructure.md#41-本地--github--zeabur当前主流程)）。管理端默认不部署公网。

### 2.2 Cursor Cloud / Codespaces（可选备用）

- Cloud Agents：[cursor.com/agents](https://cursor.com/agents) 选 `AquaGrove/keyantong`
- Codespaces：https://codespaces.new/AquaGrove/keyantong

开源工程骨架已落地；按本节即可启动门户与依赖库。

## 3. 推荐启动方式

### 3.1 一键依赖

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

（启动 PostgreSQL + Redis。）

### 3.2 客户端门户（:3000）

```bash
pnpm --dir apps/portal dev
# 或: cd apps/portal && pnpm dev
# 路由：/  /community  /tools  /about
```

### 3.2b 管理端（:3001，仅站长）

```bash
pnpm --dir apps/admin dev
# http://127.0.0.1:3001/login
# 需 .env 中 ADMIN_PASSWORD；会话 Cookie 鉴权
```

详见 [`apps/admin/README.md`](../apps/admin/README.md)。

### 3.3 服务 stub

```bash
cd services/bridge && uv sync && uv run uvicorn app.main:app --reload --port 8000
cd services/rag && uv sync && uv run uvicorn app.main:app --reload --port 8001
```

### 3.4 论坛（NodeBB）

```bash
docker compose -f forum/nodebb/docker-compose.yml up -d
# http://localhost:4567
```

本地可先用 Mock Webhook 向 bridge/rag 打事件，不强制本机完整论坛。

### 3.5 冒烟

```bash
./scripts/smoke.sh
```

## 4. 环境变量（最小）

见根目录 `.env.example`。常用：

```bash
DATABASE_URL=postgres://kt:kt@localhost:5432/keyantong
REDIS_URL=redis://localhost:6379/0
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
ADMIN_PASSWORD=changeme
ADMIN_SESSION_SECRET=replace-with-long-random-string
AI_SUGGEST_ENABLED=false
```

## 5. 分支模型

| 分支 | 用途 |
|------|------|
| `main` | 生产可发布 |
| `develop` | 集成（可选） |
| `feat/*` | 功能 |
| `fix/*` | 修复 |
| `docs/*` | 文档 |

提交信息：Conventional Commits（`feat:` `fix:` `docs:` …）。

## 6. 相关文档

- [贡献指南](./12-contribution.md)  
- [基础设施](./08-infrastructure.md)  
- [ADR](./14-adr.md)  
