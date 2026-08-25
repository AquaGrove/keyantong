"""科研通论坛桥接服务（stub）。"""

from fastapi import FastAPI

app = FastAPI(title="keyantong-bridge", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "bridge"}
