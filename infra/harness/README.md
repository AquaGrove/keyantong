# DeepSeek Harness sidecar

Developer-preview agent UI for KeyanTong ops. **Do not expose unauthenticated to the public Internet.**

- Data: `/data/keyantong/harness` (`DSH_HOME`)
- Listen: container proxy `0.0.0.0:3080` → `dsh` on `127.0.0.1:3079`
- Host bind: `127.0.0.1:3080` only (see compose)
- Docs: `docs/22-llm-gateway-and-harness.md`
