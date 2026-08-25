# AGENTS.md

## Project

KeyanTong（科研通）— open-source research mutual-aid platform (portal + forum + tool catalog + extensible services). Apache-2.0 monorepo.

## Layout

- `apps/portal` — Next.js 15 portal (primary UI)
- `services/bridge`, `services/rag` — FastAPI stubs
- `packages/contracts` — shared types / OpenAPI
- `catalog/tools` — community tool-card YAML
- `forum/nodebb` — NodeBB Compose
- `docs/` — product and architecture docs (source of truth)

## Commands

```bash
pnpm install --ignore-scripts
pnpm --dir apps/portal dev          # http://localhost:3000
pnpm --dir apps/portal exec tsc --noEmit
./scripts/smoke.sh
docker compose -f infra/docker-compose.dev.yml up -d   # Postgres + Redis
```

## Rules

- Prefer compliance-first literature help (legal/OA paths only; no piracy).
- Do not invent DOIs/citations; verify when claiming sources.
- Keep changes scoped; update ADRs in `docs/14-adr.md` for architectural decisions.
- Secrets belong in Cursor Cloud Secrets / `.env` (never commit).

## Cursor Cloud specific instructions

1. Repo for Cloud Agents: `AquaGrove/keyantong` (GitHub).
2. Environment is defined in `.cursor/environment.json` (`install` + portal `terminals`).
3. After boot, portal should already be starting via the `portal` terminal; otherwise run `pnpm --dir apps/portal dev`.
4. Optional deps: `docker compose -f infra/docker-compose.dev.yml up -d` when Docker is available.
5. Prefer opening PRs to `main` for cloud agent work; do not force-push `main`.
6. Deploy target later: Zeabur (portal first). NodeBB/DB may use a separate larger host.
