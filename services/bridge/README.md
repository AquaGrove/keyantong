# Bridge service

Webhook / 积分 / 用户镜像的 stub。当前仅提供 `/health`。

```bash
cd services/bridge
uv sync
uv run uvicorn app.main:app --reload --port 8000
```
