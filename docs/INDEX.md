# 科研通开发者文档索引

本文档体系覆盖从产品定义到部署运维的完整工程规划，供架构、后端、前端、运维与贡献者共用。

## 阅读地图

| 编号 | 文档 | 受众 | 内容摘要 |
|------|------|------|----------|
| 00 | [文档约定](./00-conventions.md) | 全员 | 术语、版本、文档维护约定 |
| 01 | [产品愿景与问题定义](./01-product-vision.md) | 产品 / 全员 | 问题—基础—目标、边界与非目标 |
| 02 | [系统架构](./02-architecture.md) | 架构 / 后端 | 分层架构、子系统边界、数据流 |
| 03 | [技术选型](./03-tech-stack.md) | 全员 | 栈选型、取舍理由、替代方案 |
| 04 | [核心模块设计](./04-modules.md) | 产品 / 研发 | 论坛、AI、软件、分析、贡献 |
| 05 | [数据模型](./05-data-model.md) | 后端 | ER 概念、关键表、积分与知识入库 |
| 06 | [API 规范](./06-api.md) | 前后端 | REST 约定、核心端点、错误码 |
| 07 | [RAG 与智能响应](./07-rag.md) | AI / 后端 | 检索策略、入库、评测、安全 |
| 08 | [基础设施与部署](./08-infrastructure.md) | 运维 | 服务器、域名、Zeabur、监控备份 |
| 09 | [本地开发指南](./09-development-guide.md) | 研发 | 环境、Compose、分支、联调 |
| 10 | [MVP 与路线图](./10-roadmap-mvp.md) | 产品 / 研发 | 阶段目标、验收标准、不做清单 |
| 11 | [安全与合规](./11-security.md) | 全员 | 认证、内容、版权、隐私 |
| 12 | [贡献者指南](./12-contribution.md) | 外部贡献者 | 如何贡献工具、知识、代码 |
| 13 | [运维 Runbook](./13-runbook.md) | 运维 | 发布、回滚、故障处理 |
| 14 | [决策记录 ADR](./14-adr.md) | 架构 | 关键技术决策与背景 |
| 15 | [RNAseq / NCBI 工具](./15-rnaseq-ncbi-tools.md) | 研发 | 一键分析与上传辅助 |
| 16 | [轻量云规格](./16-lightweight-cloud-sizing.md) | 运维 | 校园试用与拆分部署 |
| 17 | [社区工具分享](./17-community-tool-share.md) | 产品 / 研发 | 工具分享/求助 MVP |
| 18 | [安全基线落地](./18-security-baseline.md) | 全员 | 威胁模型与门户加固 |
| 19 | [NCBI 本机直连上传](./19-ncbi-local-upload-architecture.md) | 产品 / 研发 | 大数据不经门户 |
| 99 | [附录](./99-appendix.md) | 全员 | 目录骨架、环境变量、修订记录 |

## 状态说明

| 状态 | 含义 |
|------|------|
| `Accepted` | 已确认，按此执行 |
| `Proposed` | 草案，可讨论后修订 |
| `Deprecated` | 已废弃，仅留档 |

当前文档整体状态：**Accepted（规划基线 v0.2 + 开源工程骨架）**。实现细节随代码落地迭代，以 ADR 记录重大变更。

## 文档维护

- 重大架构变更：先更新对应章节，再补 ADR
- API 变更：同步更新 `06-api.md` 与 OpenAPI（代码阶段）
- 每个 PR 若触及行为约定，需更新相关文档片段

## 工程落地补充

- [15 · 转录组一键分析与 NCBI 上传协助](./15-rnaseq-ncbi-tools.md)
- [16 · 轻量云服务器选型](./16-lightweight-cloud-sizing.md)
- [17 · 社区工具分享与求助](./17-community-tool-share.md)
- [18 · 开源门户安全基线](./18-security-baseline.md)
- [19 · NCBI 本机直连上传](./19-ncbi-local-upload-architecture.md)
