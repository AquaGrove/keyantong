# 附录 A · 仓库目录规范（已落地骨架）

代码骨架已按此创建；细节随实现迭代。

```text
keyantong/
├── README.md
├── LICENSE / NOTICE
├── CONTRIBUTING.md / GOVERNANCE.md / SECURITY.md / CODE_OF_CONDUCT.md
├── docs/                          # 开发者文档
├── apps/
│   ├── portal/                    # Next.js 门户
│   └── admin/                     # 后期
├── services/
│   ├── bridge/                    # 论坛 Webhook、积分、用户镜像（stub）
│   └── rag/                       # 智能初答（stub）
├── forum/nodebb/                  # NodeBB Compose 覆写、插件目录
├── catalog/
│   └── tools/                     # 工具卡 YAML
├── packages/
│   └── contracts/                 # OpenAPI / 共享类型
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── caddy/Caddyfile.example
│   └── backup/                    # 后期
├── scripts/
│   ├── seed-forum.md
│   └── smoke.sh
├── .env.example
├── .gitignore
└── .github/                       # CI、Issue/PR 模板、CODEOWNERS
```

## 附录 B · 环境变量清单（规划）

| 变量 | 服务 | 说明 |
|------|------|------|
| `DATABASE_URL` | bridge/rag/toolhub/analysis | Postgres |
| `REDIS_URL` | 同上 | 缓存与队列 |
| `LLM_API_KEY` | rag | 生成 |
| `LLM_BASE_URL` | rag | 兼容 OpenAI 的端点 |
| `EMBEDDING_API_KEY` | rag | 可与 LLM 相同或分离 |
| `AI_SUGGEST_ENABLED` | rag/bridge | 总开关 |
| `FORUM_BASE_URL` | bridge | 论坛根 URL |
| `FORUM_API_KEY` | bridge | 上游 API |
| `FORUM_WEBHOOK_SECRET` | bridge | HMAC |
| `OSS_ENDPOINT` / `OSS_BUCKET` / `OSS_ACCESS_KEY` / `OSS_SECRET_KEY` | analysis/toolhub | 对象存储 |
| `PUBLIC_PORTAL_URL` | portal | 规范链接 |
| `NEXT_PUBLIC_API_BASE` | portal | 浏览器可见 API 前缀 |
| `NEXT_PUBLIC_BBS_URL` | portal | 社区入口 |
| `INTERNAL_API_SECRET` | portal + admin | 管理端调门户用户接口 |
| `DATA_DIR` | portal | `users.json` 目录（勿提交） |
| `EMAIL_DEV_ECHO` | portal | 注册验证码回显 |
| `OPENALEX_API_KEY` | portal | OpenAlex 个人密钥（免费） |

完整示例：根目录 [`.env.example`](../.env.example)。

## 附录 C · 文档修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-25 | 首版完整开发者文档基线 |
| v0.2 | 2026-08-25 | 开源工程骨架落地；NodeBB / Apache-2.0 / Monorepo ADR |
| v0.3 | 2026-10-23 | 校园邮箱会员、文献关系网、管理端用户 |
