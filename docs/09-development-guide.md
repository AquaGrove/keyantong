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

### 2.1 GitHub Codespaces（推荐云端开发）

1. 打开 https://github.com/2366117804qqcom-ui/keyantong  
2. **Code → Codespaces → Create codespace on main**  
3. 等待 `postCreate`（安装 pnpm 依赖）完成后：

```bash
pnpm dev:portal
```

在 Ports 面板打开 `3000`。`.devcontainer/` 已预装 Node 20、Python 3.12、Docker-in-Docker 与 GitHub CLI。

### 2.2 本地 clone

```bash
git clone https://github.com/2366117804qqcom-ui/keyantong.git
cd keyantong
cp .env.example .env
pnpm install --ignore-scripts
```

开源工程骨架已落地；按本节即可启动门户与依赖库。

## 3. 推荐启动方式

### 3.1 一键依赖

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

（启动 PostgreSQL + Redis。）

### 3.2 门户

```bash
pnpm --dir apps/portal dev
# 或: cd apps/portal && pnpm dev
```

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
NEXT_PUBLIC_BBS_URL=http://localhost:4567
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
