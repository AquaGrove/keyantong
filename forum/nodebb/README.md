# NodeBB 部署覆写

科研通论坛引擎已选定 **NodeBB**（见 ADR-001）。

本目录存放生产/预发覆写配置，**不 vendor 上游完整源码**。推荐使用官方 Docker 镜像并挂载配置。

## 快速试验（开发机）

```bash
docker compose -f forum/nodebb/docker-compose.yml up -d
```

默认将 NodeBB 暴露在 `http://localhost:4567`。首次访问按向导初始化；生产环境必须修改密钥、绑定域名并置于 Caddy/Nginx 之后。

## 与科研通集成点

- Webhook → `services/bridge`
- 结构化字段 / 插件：后续放在 `forum/nodebb/plugins/`
- SSO：成长期 OIDC，见 `docs/11-security.md`
