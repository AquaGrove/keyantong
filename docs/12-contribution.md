# 12 · 贡献者指南

**状态：** Accepted  
**版本：** v0.2

欢迎任何人以合规方式为科研通贡献：**回答问题、沉淀知识、提交工具卡、环境模板、分析微工具或代码**。  
仓库入口速览：[CONTRIBUTING.md](../CONTRIBUTING.md)。

## 0. 五分钟第一次贡献

| 路径 | 动作 | 产出 |
|------|------|------|
| 社区回答 | 在论坛回复，附 OS/版本/最小复现 | 被采纳即可获积分（上线后） |
| 工具卡 | 复制 `catalog/tools/example-tool.yaml` → PR | 目录多一条可检索软件卡 |
| 文档 | 修正 `docs/` 错漏或补 ADR | 知识可审计 |
| 代码 | Fork → 小 PR，跑 `./scripts/smoke.sh` | 门户/服务改进 |

## 1. 行为准则（摘要）

- 尊重、专业、就事论事  
- 不传播侵权与恶意内容  
- 接受版主对质量与安全的裁定  
- 争议升级到平台反馈版，不人身攻击  

完整版：[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)；社区规约页随论坛上线发布。

## 2. 贡献类型与路径

| 类型 | 怎么做 | 审核人 |
|------|--------|--------|
| 回答求助 | 在论坛回复；附复现与版本信息 | 提问者采纳 / 版主加精 |
| 知识入库 | 高质内容申请入库或版主提名 | 版主 |
| 工具卡 | PR 到 `catalog/tools/*.yaml` | 维护者 |
| 环境模板 | 附 `environment.yml` / compose 与说明 | 维护者 + 冒烟 |
| 分析工具 | 按「工具包规范」提交 | 安全审核 + 试跑 |
| 主仓库代码 | Fork → PR | CODEOWNERS |

## 3. 好答案标准

一份优质回复通常包含：

1. 环境：OS、软件版本、包管理器  
2. 最小复现步骤  
3. 原因说明（为何失败）  
4. 可逆的解决步骤  
5. 参考链接（官方文档优先）  

## 4. 工具卡规范（草案）

文件名：`{slug}.yaml`

```yaml
id: example-tool
name: Example Tool
summary: 一句话说明
categories: [sequence]
license: MIT
author: github-or-forum-id
install:
  conda: channel::package
  docker: org/image:tag
  notes: |
    常见安装注意点
common_pitfalls:
  - 坑 1
  - 坑 2
links:
  docs: https://…
  forum_tags: [example-tool]
```

**必须**：摘要真实、安装来源合法、不附带破解。示例见 [`catalog/tools/example-tool.yaml`](../catalog/tools/example-tool.yaml)。

## 5. 分析工具包规范（成长期）

目录示例：

```text
tools/fasta-stats/
  tool.yaml          # 元数据与资源限额
  openapi.yaml       # 输入输出契约
  Dockerfile
  README.md          # 中文使用说明
  tests/             # 小样例与期望输出
```

`tool.yaml` 关键字段：

| 字段 | 要求 |
|------|------|
| `id` | 全局唯一 slug |
| `image` | 可拉取的 OCI 引用 |
| `timeout_sec` / `mem_mb` / `cpu` | 不超过平台上限 |
| `network` | 默认 `false` |
| `license` | 开源许可清晰 |

审核清单：

- [ ] 无特权、非 root 运行（建议）  
- [ ] 无挖矿/反弹 shell 等恶意行为  
- [ ] 样例测试通过  
- [ ] 文档说明输入限制与失败含义  

## 6. 代码贡献流程

1. 开 Issue 说明动机（重大功能先讨论）  
2. 从小 PR 开始  
3. 遵循 [开发指南](./09-development-guide.md)  
4. 更新相关文档  
5. 等待 Review  

## 7. 署名与激励

- 工具页与贡献者榜展示作者  
- 积分与徽章（规则见模块文档）  
- 不承诺股权或现金回报  

## 8. 许可

- 贡献代码与文档默认许可与主仓库一致：**Apache-2.0**  
- 贡献工具卡：允许平台展示与改编用于检索，作者保留署名权；YAML 内声明组件自身 license  
- 不得上传你无权授权的材料  
