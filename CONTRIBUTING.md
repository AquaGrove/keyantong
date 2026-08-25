# 参与贡献

科研通最大的宗旨是 **开源共享**：任何人都可以按规范出一份力。  
详细规范见 [docs/12-contribution.md](./docs/12-contribution.md)；本地开发见 [docs/09-development-guide.md](./docs/09-development-guide.md)。

## 五分钟第一次贡献

按门槛从低到高选择一条路径即可：

| 路径 | 做什么 | 从哪里开始 |
|------|--------|------------|
| A. 社区回答 | 在论坛回复求助帖，附版本与复现 | 上线后的 `bbs.`（见 README） |
| B. 工具卡 | 新增一条软件/环境元数据 YAML | [`catalog/tools/`](./catalog/tools/) |
| C. 文档 | 修正错漏、补充 ADR/指南 | [`docs/`](./docs/) |
| D. 代码 | 门户、桥接、RAG 等服务 | Fork → 小 PR |

### 工具卡最小步骤

1. 复制 [`catalog/tools/example-tool.yaml`](./catalog/tools/example-tool.yaml)
2. 改名为 `{slug}.yaml`，填真实安装来源与常见坑
3. 开 PR，标题建议：`catalog: add {slug}`

### 代码最小步骤

1. 开 Issue 说明动机（大功能先讨论）
2. `pnpm install`（仓库根目录）
3. 本地依赖：`docker compose -f infra/docker-compose.dev.yml up -d`
4. 改动后跑 `./scripts/smoke.sh`
5. 按 [PR 模板](./.github/PULL_REQUEST_TEMPLATE.md) 提交

## 许可

向本仓库提交代码与文档，默认按 **Apache License 2.0** 授权（见 [LICENSE](./LICENSE)），除非你明确标注且维护者书面同意例外。

不得上传你无权授权的材料；禁止侵权全文与恶意载荷。

## 行为

请遵守 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。
