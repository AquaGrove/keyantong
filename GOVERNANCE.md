# 治理（轻量）

科研通采用「维护者 + 社区贡献」的轻量治理，目标是：**决策可追溯、贡献可进入、生产可稳定**。

## 角色

| 角色 | 职责 |
|------|------|
| 贡献者 | Issue / PR / 工具卡 / 论坛回答 |
| 审查者 | 对 PR 做技术与合规审查 |
| 维护者 | 合并权限、发布节奏、安全响应 |
| 版主 | 论坛内容质量与合规（社区侧） |

维护者名单维护在 [`.github/CODEOWNERS`](./.github/CODEOWNERS) 与仓库 Settings。

## 决策原则

冲突时按 [docs/00-conventions.md](./docs/00-conventions.md) 优先级：

1. 安全与合规  
2. 产品边界与非目标  
3. 已 Accepted 的 ADR  
4. 专题文档  
5. 口头讨论（事后必须落文档或 ADR）

重大架构变更：**先 ADR，后合并代码**。

## 贡献合并

- 小 PR 优先；破坏性变更需 Issue + ADR  
- 至少一名维护者 Approve（初期可自审，但须勾选合规清单）  
- CI（`ci.yml`）必须通过  

## 发布节奏（规划）

| 轨道 | 节奏 |
|------|------|
| 文档 / 工具卡 | 随时合并 |
| 门户与 stub 服务 | 按需打 tag `v0.x.y` |
| 论坛上游升级 | 独立变更窗口，先 staging |

## 行为与安全

- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)  
- [SECURITY.md](./SECURITY.md)  
