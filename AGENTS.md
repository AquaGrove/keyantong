# AGENTS.md

## Project

KeyanTong（科研通）— open-source research mutual-aid platform (portal + forum + tool catalog + extensible services). Apache-2.0 monorepo.

## Layout

- `apps/portal` — Next.js 15 portal (primary UI)
- `services/bridge`, `services/rag` — FastAPI stubs
- `services/rnaseq-pipeline` — matrix+groups one-click RNAseq downstream
- `services/ncbi-upload` — NCBI SRA validate + ascp command assist
- `packages/contracts` — shared types / OpenAPI
- `catalog/tools` — community tool-card YAML
- `forum/nodebb` — NodeBB Compose
- `docs/` — product and architecture docs (source of truth)

## Commands

```bash
pnpm install --ignore-scripts
pnpm --dir apps/portal dev          # http://localhost:3000
pnpm --dir apps/admin dev           # http://localhost:3001
pnpm --dir apps/portal exec tsc --noEmit
./scripts/smoke.sh                  # includes rnaseq + ncbi checks
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres + Redis
```

## Rules

- Prefer compliance-first literature help (legal/OA paths only; no piracy).
- Do not invent DOIs/citations; verify when claiming sources.
- Keep changes scoped; update ADRs in `docs/14-adr.md` for architectural decisions.
- Secrets belong in Cursor Cloud Secrets / `.env` (never commit).

## Cursor Cloud specific instructions

Local development is the default workflow (push to GitHub → Zeabur). Cloud Agents are optional.

1. Repo: `AquaGrove/keyantong`. Deploy target: Zeabur portal via `zbpack.json` → `apps/portal`.
2. If running in Cloud: `.cursor/environment.json` installs deps and starts portal.
3. Prefer PRs to `main`; do not force-push `main`.
