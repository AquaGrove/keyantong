# 25 · 我的打工人与宠物（MVP）

**状态：** Accepted（MVP）

## 产品

- **内页壳：** 去掉传统顶栏（logo + 模块导航）与底栏；全站用浮动 **「求助AI助手」** 召唤打工人/宠物、回首页对话，并在面板内切换中英 / 进账号。
- **首页：** 登录后可 **添加我的打工人**（名称、人设、擅长）或宠物；列表可召唤独立聊天窗。
- **记忆：** 每个角色 `userId + agentId` 独立 file-backed 记忆（摘要 + 近轮对话），聊天走现有 LLM 网关并注入角色 system prompt。

## 存储

```
$DATA_DIR/workers/<userId>/agents.json
$DATA_DIR/workers/<userId>/<agentId>/memory.json
```

限额：打工人 ≤8，宠物 ≤3；记忆消息保留最近约 40 条。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/workers` | 列表 / 创建（需登录） |
| GET/DELETE | `/api/workers/[id]` | 详情含记忆 / 删除 |
| POST | `/api/workers/[id]/chat` | 角色对话（需会员额度） |

## 非目标（本轮）

- 多模态宠物形象、商店、跨用户分享角色
- 向量长期记忆（当前为滚动摘要）


## 与首页调度相通

打工人聊天在检测到转录组 / NCBI / 工具 / 文献等意图时，复用 `lib/dispatch/intent` 的准备清单与「下一步」跳转，与首页调度一致；一般闲聊仍走角色 LLM。窗口可拖动，默认停在左侧避开主聊天。
