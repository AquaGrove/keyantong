# 科研通（KeyanTong）

面向科研人员的 **开源共享** 互助平台：**社区 + 工具目录 + 可扩展服务**。  
任何人都可以按规范出一份力——回答问题、提交工具卡、改进文档或贡献代码。

## 产品一句话

帮科研人员在文献策略、软件环境、脚本排错与基础分析之间少切换、快响应、可复现；以合规互助逼近「科研协作少壁垒」。

## 开源宗旨

| 原则 | 含义 |
|------|------|
| 开源共享 | 主仓库 Apache-2.0；贡献默认同许可 |
| 分层贡献 | 论坛回答 → 工具卡 YAML → 文档 → 代码 PR，门槛递增 |
| 稳定演进 | Monorepo 解耦、Compose 可复现、CI 门禁、ADR 决策 |
| 合规优先 | 文献互助只谈合法路径；禁止盗版分发与恶意载荷 |

参与方式见 [CONTRIBUTING.md](./CONTRIBUTING.md) · 治理见 [GOVERNANCE.md](./GOVERNANCE.md) · 行为准则见 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## 核心模块

| 模块 | 说明 | 阶段 |
|------|------|------|
| 互动论坛（NodeBB） | 文献求助、软件交流、分析咨询等分类社区 | MVP |
| AI 智能响应 | 发帖时相似帖推荐 + RAG 初答草稿 | MVP 二期 |
| 软件模块 | 软件卡片、环境模板、常见坑（`catalog/tools`） | 成长期 |
| 在线分析 | 通用序列/可视化等微服务化工具 | 扩展期 |
| 贡献体系 | 任何人可提交工具、知识、流程 | 贯穿全程 |

## 文档入口

完整开发者文档见 [`docs/INDEX.md`](./docs/INDEX.md)。

建议阅读顺序：

1. [产品愿景与问题定义](./docs/01-product-vision.md)
2. [系统架构](./docs/02-architecture.md)
3. [技术选型](./docs/03-tech-stack.md)
4. [MVP 路线图](./docs/10-roadmap-mvp.md)
5. [本地开发指南](./docs/09-development-guide.md)

## 仓库结构

```text
科研通/
├── README.md
├── LICENSE / NOTICE / CONTRIBUTING.md / GOVERNANCE.md / SECURITY.md
├── docs/                 # 开发者文档
├── apps/
│   ├── portal/           # Next.js 门户
│   └── admin/            # 管理后台（后期）
├── services/
│   ├── bridge/           # 论坛 Webhook / 积分桥接（stub）
│   └── rag/              # RAG 初答（stub）
├── packages/contracts/   # 共享类型 / OpenAPI
├── catalog/tools/        # 社区可 PR 的工具卡 YAML
├── forum/nodebb/         # NodeBB Compose 覆写
├── infra/                # Docker Compose、Caddy 示例
└── scripts/              # smoke / 种子清单
```

## 云端开发（推荐：Cursor Cloud Agents）

主路径是 [cursor.com/agents](https://cursor.com/agents)：连接 GitHub 后选择仓库 **`AquaGrove/keyantong`**，在云端 VM 里改代码、跑门户并开 PR。

1. 在 [Integrations](https://cursor.com/dashboard/integrations) 连接 GitHub，授权本仓库（或 All repositories）
2. 打开 [Cloud Agents](https://cursor.com/agents)，仓库下拉选 `AquaGrove/keyantong`
3. 环境配置见 `.cursor/environment.json` 与根目录 `AGENTS.md`（会 `pnpm install` 并启动 portal）

可选备用：GitHub Codespaces（[一键打开](https://codespaces.new/AquaGrove/keyantong)），配置在 `.devcontainer/`。

## 本地快速启动

```bash
cp .env.example .env
pnpm install --ignore-scripts   # 若遇 sharp 构建策略限制
docker compose -f infra/docker-compose.dev.yml up -d
pnpm --dir apps/portal dev      # http://localhost:3000
./scripts/smoke.sh
```

服务 stub：

```bash
# bridge :8000  /  rag :8001
cd services/bridge && uv sync && uv run uvicorn app.main:app --reload --port 8000
```

## 快速原则

- **社区为核**：论坛产生内容，内容喂给 RAG  
- **API 优先**：子系统解耦，便于独立部署与第三方贡献  
- **少造轮子**：论坛用 NodeBB，不自研发帖引擎  
- **重算分离**：轻量业务与分析/GPU 负载分机部署  
- **合规优先**：文献互助强调合法获取路径，不做盗版分发  

## 许可证

[Apache License 2.0](./LICENSE)
