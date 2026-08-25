# 03 · 技术选型

**状态：** Accepted  
**版本：** v0.1

## 1. 选型总表

| 层级 | 选型 | 备选 | 说明 |
|------|------|------|------|
| 门户前端 | Next.js（App Router）+ TypeScript | Nuxt | SSR/SEO、生态成熟 |
| UI | 自建设计系统 + CSS Modules/Tailwind（择一） | — | 避免无品牌的模板感 |
| 论坛 | **NodeBB**（已拍板，ADR-001） | Discourse | 同栈、省内存；配置见 `forum/nodebb/` |
| 主数据库 | PostgreSQL 15+ | — | 业务与（可选）pgvector |
| 缓存/队列 | Redis 7+ | — | 会话、限流、Celery/RQ |
| 向量库 | pgvector（先） / Qdrant（后） | Milvus | MVP 降低运维 |
| RAG 服务 | Python FastAPI | Node NestJS | 与 AI 生态更贴合 |
| 分析服务 | FastAPI + Docker | — | 一工具一镜像 |
| Worker | RQ 或 Celery | — | 与 Redis 搭配 |
| 对象存储 | 阿里云 OSS / 腾讯云 COS | S3 兼容 | 附件与作业 IO |
| LLM | 外部 API（DeepSeek / 通义 / OpenAI 等） | 自托管 | MVP 禁止自托管大模型 |
| Embedding | bge-m3 或云厂商 Embedding API | — | CPU 可跑 |
| 部署 | 国内 VPS + Docker Compose；可选 Zeabur | K8s | MVP 不上 K8s |
| CI | GitHub Actions | — | lint / test / 镜像构建 |
| 观测 | 结构化日志 + Uptime；后期 Grafana | — | |

## 2. 论坛选型对比（必须拍板）

| 维度 | Discourse | NodeBB |
|------|-----------|--------|
| 成熟度 / 插件 / SEO | 很强 | 较强 |
| 资源占用 | **较高（建议 2C8G）** | 较低（2C4G 可起步） |
| 技术栈 | Ruby + Ember | Node.js |
| 与 TS 全栈一致性 | 低 | 高 |
| 二次开发成本 | 插件体系清晰但栈隔离 | 同语言栈，嵌入更容易 |
| 推荐场景 | 重视社区运营与 SEO | 团队更熟 Node、机器内存紧 |

**决策（Accepted）：**

- 已选择 **NodeBB**（ADR-001）  
- 对比表保留供审计；12 个月内原则上不更换引擎  

历史规则（选型时）：

- 若优先「社区产品完成度、长期运营」→ Discourse  
- 若优先「与自研服务同栈、省内存」→ **NodeBB**  
- 拍板后写入 [ADR-001](./14-adr.md)，此后禁止无 ADR 换引擎  

## 3. 关键取舍

### 3.1 为什么不自研论坛

MVP 验证的是需求与内容飞轮，不是发帖系统；自研论坛将吞噬 3–6 个月且质量难及开源产品。

### 3.2 为什么 RAG 用 Python

分块、评测、向量与数据科学工具链以 Python 最省；门户仍用 TypeScript。

### 3.3 为什么 LLM 走 API

验证「初答是否提升采纳与留存」不依赖自有算力；自托管引入 GPU、运维与合规成本，推迟到有明确 ROI。

### 3.4 为什么分析要容器化微服务

- 依赖隔离（bioconda / 系统库冲突）  
- 按工具扩缩容与资源限额  
- 贡献者可独立发版  

## 4. 仓库与包管理（目标）

- Monorepo 建议：`pnpm` workspace（前端）+ `uv`/`poetry`（Python 服务）  
- 共享类型：`packages/contracts`（OpenAPI 生成或 zod/pydantic 对齐）  
- 禁止前端直连数据库  

## 5. 编码基线

| 项 | 约定 |
|----|------|
| 语言 | TS strict；Python 3.11+ |
| 格式化 | Prettier / Ruff |
| Lint | ESLint / Ruff |
| 提交信息 | Conventional Commits（`feat:` `fix:` `docs:` …） |
| 测试 | 关键路径单测；RAG 用固定评测集；分析用 golden file |

## 6. 明确延期的技术

- Kubernetes / Service Mesh  
- 自研 SSO 完整 IdP（先用论坛账号 + 后期 OIDC）  
- 多区域多活  
- 端到端加密聊天  
- 链上积分 / Token 经济  
