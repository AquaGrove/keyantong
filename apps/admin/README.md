# 管理端云端部署（Zeabur）

管理端与客户端是**两个独立服务**：

| 服务 | 目录 | 公网 |
|------|------|------|
| 客户端 portal | `apps/portal`（根目录 `zbpack.json`） | 可公开，如 `keyantong.zeabur.app` |
| 管理端 admin | `apps/admin`（可用 `zbpack.admin.json` 或 Root=`apps/admin`） | **仅你知道域名** + `ADMIN_PASSWORD` |

## 在 Zeabur 新增第二个 Git 服务

1. 同一项目 → Add Service → Git → 仍选 `AquaGrove/keyantong`
2. Root Directory / App Dir 设为 `apps/admin`  
   （或复制根目录 `zbpack.admin.json` 内容到该服务的构建配置 / 环境变量 `ZBPACK_APP_DIR=apps/admin`）
3. 生成一个**不对外宣传**的域名（例如随机子域），不要挂在门户导航上
4. 环境变量（必填）：

```bash
ADMIN_PASSWORD=强口令
ADMIN_SESSION_SECRET=更长的随机串
INTERNAL_API_SECRET=与门户相同的内部密钥
NEXT_PUBLIC_SITE_URL=https://keyantong.zeabur.app
PORTAL_URL=https://keyantong.zeabur.app
NEXT_PUBLIC_GITHUB_OWNER=AquaGrove
NEXT_PUBLIC_GITHUB_REPO=keyantong
# 可选
GITHUB_TOKEN=
NEXT_PUBLIC_API_BASE=
NEXT_PUBLIC_RAG_BASE=
NEXT_PUBLIC_BBS_URL=
```

5. 打开 `https://你的私密域名/login` 用口令登录
6. 门户服务同样设置 `INTERNAL_API_SECRET` 与 `DATA_DIR`（持久卷）。管理端「用户」页通过该密钥调用门户 `/api/internal/users`，两个服务磁盘不共享。

## 安全

- 不要把管理域名写进客户端页脚/README 醒目位置
- 使用强口令；可定期更换 `ADMIN_PASSWORD`（旧会话在 secret 变更后失效）
- 勿关闭登录中间件；勿把口令提交进 Git
