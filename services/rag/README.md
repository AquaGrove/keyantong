# RAG service

相似帖与 AI 初答草稿的 stub。当前仅提供 `/health`。

```bash
cd services/rag
uv sync
uv run uvicorn app.main:app --reload --port 8001
```
