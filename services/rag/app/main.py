"""科研通 RAG 智能初答服务（stub）。"""

from fastapi import FastAPI

app = FastAPI(title="keyantong-rag", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rag"}
