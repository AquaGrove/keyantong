# 14 · 架构决策记录（ADR）

**状态：** Accepted（目录）  
**版本：** v0.1

ADR 用于记录「当时为什么这样选」。格式统一，拍板后只追加，不删改历史；若推翻则新建 ADR 并标记旧条 `Superseded`。

## ADR 模板

```markdown
# ADR-XXX: 标题

- 状态: Proposed | Accepted | Superseded by ADR-YYY
- 日期: YYYY-MM-DD
- 决策人:

## 背景

## 决策

## 后果

## 备选方案
```

---

## ADR-001: 论坛引擎选型

- 状态: **Accepted**  
- 日期: 2026-08-25  
- 决策人: 项目负责人  

### 背景

科研通 MVP 以社区为核心，需在 Discourse 与 NodeBB 间选择，避免自研论坛。算力与运维成本需可控，并与 TypeScript 自研服务栈对齐。

### 决策

采用 **NodeBB** 作为论坛引擎。

### 后果

- 建议起步规格 **2C4G**（低于 Discourse 的 8G 建议）  
- 插件与 Webhook 按 NodeBB 上游实现；配置覆写放在 `forum/nodebb/`  
- 12 个月内原则上不更换引擎；若更换须新 ADR 并标记本条 Superseded  

### 备选方案

- Discourse：运营/SEO 更强，但内存占用高——否决（当前资源与同栈优先级）  
- Flarum、自研：否决（生态或成本不适合 MVP）  

---

## ADR-002: MVP 优先论坛而非独立 RAG 机器人

- 状态: **Accepted**  
- 日期: 2026-08-24  

### 背景

存在两条启动路径：先做文献互助论坛，或先做科研问答机器人。

### 决策

采用 **论坛优先 + 发帖场景轻量 RAG 初答**；不把独立聊天机器人作为 MVP。

### 后果

- 内容资产与 SEO 起步更实  
- RAG 依赖种子帖与审核入库，冷启动需运营  
- AI 以插件/侧栏建议形态出现  

### 备选方案

纯 RAG 机器人：否决（缺自有语料、难留存、与贡献激励冲突）。

---

## ADR-003: LLM 使用外部 API，MVP 不自托管大模型

- 状态: **Accepted**  
- 日期: 2026-08-25  

### 背景

需控制成本与运维复杂度，同时验证初答价值。

### 决策

生成走外部 LLM API；Embedding 可用 API 或 CPU 小模型；不采购 GPU。

### 后果

有按量费用与供应商依赖；通过预算告警与开关控制风险。

### 备选方案

自托管 7B+：推迟至有明确 ROI。

---

## ADR-004: 分析与业务库权威分离，论坛库不直写

- 状态: **Accepted**  
- 日期: 2026-08-25  

### 背景

多子系统易出现跨库脏写。

### 决策

帖子权威在论坛；积分/工具/Job 在自研 PG；集成仅 API/Webhook/官方插件。

### 后果

有一定同步延迟与工程量；换论坛版本更安全。

---

## ADR-005: 部署形态 —— 国内 VPS 为主，Zeabur 为辅

- 状态: **Accepted**  
- 日期: 2026-08-25  

### 背景

需兼顾备案/延迟与快速部署。

### 决策

论坛与数据库放国内 VPS；门户或无状态服务可放 Zeabur；重算后期独立节点。

### 后果

运维需熟悉 Compose；避免过早上 K8s。

---

## ADR-006: 主仓库采用 Apache License 2.0

- 状态: **Accepted**  
- 日期: 2026-08-25  
- 决策人: 项目负责人  

### 背景

科研通以开源共享为宗旨，需选定适合大型协作、含专利授权条款的 OSI 许可。计划草案曾称 ADR-003，因编号已被「外部 LLM」占用，故记为 ADR-006。

### 决策

主仓库与默认贡献许可为 **Apache-2.0**（见根目录 `LICENSE` / `NOTICE`）。

### 后果

- 贡献默认同许可（见 `CONTRIBUTING.md`）  
- NodeBB 等上游仍遵循其各自许可证  
- 工具卡需声明自身 `license` 字段  

### 备选方案

MIT：更短但专利条款弱——未选。GPL：对插件生态传染性强——未选。

---

## ADR-007: Monorepo 与分层贡献模型

- 状态: **Accepted**  
- 日期: 2026-08-25  
- 决策人: 项目负责人  

### 背景

大型长期项目需单一协作入口，同时让「不会写核心代码」的人也能贡献。计划草案曾称 ADR-004，因编号已被「库权威分离」占用，故记为 ADR-007。

### 决策

1. 采用 **pnpm workspace + Python services** 的 Monorepo（`apps/` `services/` `packages/` `catalog/` `forum/` `infra/`）  
2. 分层贡献：论坛回答 → `catalog/tools` YAML → `docs/` → 代码 PR  
3. 本地最小依赖：`infra/docker-compose.dev.yml`（Postgres/Redis）+ `scripts/smoke.sh` + CI  

### 后果

- 贡献路径写在 `CONTRIBUTING.md` / `docs/12-contribution.md`  
- 子系统可独立扩缩，但版本与契约在仓库内对齐  
- MVP 仍禁止引入 K8s / 自研论坛引擎  

### 备选方案

多仓库拆分：过早增加协作成本——否决。纯文档仓库无骨架：无法验证稳定性——否决。

---

## 变更日志

| 日期 | 说明 |
|------|------|
| 2026-08-25 | 建立 ADR 目录与 001–005 |
| 2026-08-25 | ADR-001 Accepted（NodeBB）；新增 ADR-006（Apache-2.0）、ADR-007（Monorepo） |
