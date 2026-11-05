# 17 · 社区工具分享与求助（MVP）

**状态：** Accepted（门户 file-backed MVP）  
**版本：** v0.1  
**相关：** [11 安全与合规](./11-security.md) · [18 安全基线落地](./18-security-baseline.md) · [04 模块](./04-modules.md)

## 1. 产品约定

科研人发现好用工具 → 发帖分享 **下载/官网链接 + 功能描述** → 他人按需求 **搜索检索** → 命中则外链使用；搜不到则进入 **工具求助**；有人能解决则发对应分享并关联 `resolved`。

与「文献互助」同属社区，但本模块 **不是** 文献 PDF 渠道。文献合规红线不变（禁止盗版 PDF 互传）。

| 能力 | 浏览/搜索 | 发帖 |
|------|-----------|------|
| 工具分享 / 求助 | 公开 | 校园邮箱登录 + 试用/永久会员（`isEntitled`） |
| 文献求助 | 公开引导 | 同上；当前仍预填 GitHub Issue |

## 2. 数据模型（file-backed）

运行时文件：`DATA_DIR/community-posts.json`（默认 monorepo `data/`，已 gitignore）。  
种子样例：`apps/portal/src/lib/community/seed-tool-posts.json`（入库）。

帖子类型：`tool_share` | `tool_help`。

关键字段：`id, type, title, description, downloadUrl?, tags[], category?, authorId, authorLabel(脱敏), createdAt, updatedAt, status(open|resolved|archived), linkedShareId?, tried?, expectedToolType?, searchText`。

## 3. API

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/community/tools?q=&type=&tag=&status=&page=&pageSize=` | 公开 + 限流 | 检索；空结果 `suggestHelp: true` |
| GET | `/api/community/tools/[id]` | 公开 + 限流 | 详情（不含 `authorId`） |
| POST | `/api/community/tools` | 登录+entitled + 限流 | 发分享/求助 |
| PATCH | `/api/community/tools/[id]` | 登录+entitled + 限流 | 改状态 / 关联 / `resolveWithShare` |

安全约束摘要：仅 http(s) 外链；拒绝 `javascript:`/`data:`/凭据/裸 IP/黑名单盗版域；纯文本消毒；盗版 PDF 话术拒绝。详见 18。

## 4. UI

- `/community`：入口磁贴（工具分享 / 工具求助 / 文献）
- `/community/tools`：搜索、列表、发帖、求助「去解决」闭环

## 5. 后续迁论坛 / NodeBB 边界

- 本 MVP **不**托管安装包、**不**替代 NodeBB；字段应对齐论坛「资源分享 / 软件环境」版块自定义字段。
- 迁移时：导出 `community-posts.json` → 论坛 topic；保留外链策略与合规文案。
- RAG：仅入库已审分享帖的标题/描述/标签，不抓取外链正文。
