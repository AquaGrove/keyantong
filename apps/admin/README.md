# 科研通管理端（Admin）

站长专用控制台，**默认只绑定本机 `127.0.0.1:3001`**。与用户端门户（`:3000`）完全分离。

## 启动

在仓库根目录配置 `.env`（见根目录 `.env.example`），至少设置：

```bash
ADMIN_PASSWORD=你的口令
ADMIN_SESSION_SECRET=长随机串
```

然后：

```bash
pnpm install --ignore-scripts
pnpm --dir apps/admin dev
# http://127.0.0.1:3001/login
```

生产本机：

```bash
pnpm --dir apps/admin build
pnpm --dir apps/admin start
```

## 模块

| 路径 | 说明 |
|------|------|
| `/login` | 口令登录 |
| `/` | 总览：仓库指标、最近提交、服务灯 |
| `/github` | 提交 / PR / Issue |
| `/services` | 健康探针与只读配置 |
| `/content` | 内容治理占位（GitHub label） |
| `/settings` | 环境状态与安全提示 |

## 安全

- 未登录无法访问业务页（Cookie 会话）。
- **不要**把 3001 暴露到公网；公网部署需另做强鉴权与网络限制。
- 口令只放 `.env`，勿提交到 Git。
