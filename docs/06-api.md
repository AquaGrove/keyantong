# 06 · API 规范

**状态：** Accepted  
**版本：** v0.1

## 1. 总约定

| 项 | 约定 |
|----|------|
| 风格 | REST + JSON |
| 前缀 | `https://api.keyantong.com/v1` |
| 时间 | ISO-8601，UTC |
| 鉴权 | `Authorization: Bearer <token>`（MVP 可先论坛 session 桥接） |
| 幂等 | 写操作支持 `Idempotency-Key`（Job 创建必须） |
| 分页 | `?cursor=` 或 `?page=&page_size=`（默认 cursor） |
| 语言 | 错误信息可中文；`code` 必须英文常量 |

### 1.1 统一响应

成功：

```json
{
  "data": {},
  "meta": { "request_id": "…" }
}
```

列表：

```json
{
  "data": [],
  "meta": { "next_cursor": "…", "request_id": "…" }
}
```

错误：

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "请求过于频繁",
    "details": {}
  },
  "meta": { "request_id": "…" }
}
```

### 1.2 常用错误码

| HTTP | code | 含义 |
|------|------|------|
| 400 | `BAD_REQUEST` | 参数错误 |
| 401 | `UNAUTHORIZED` | 未登录 |
| 403 | `FORBIDDEN` | 无权限 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 状态冲突 |
| 413 | `PAYLOAD_TOO_LARGE` | 上传超限 |
| 429 | `RATE_LIMITED` | 限流 |
| 500 | `INTERNAL` | 内部错误 |
| 503 | `UPSTREAM_UNAVAILABLE` | 论坛/LLM 不可用 |

---

## 2. RAG / 智能初答

### `POST /v1/ai/suggest`

发帖后或预览时生成相似帖 + 初答。

请求：

```json
{
  "forum_topic_id": "12345",
  "title": "conda 安装 xxx 失败",
  "body": "…",
  "structured": {
    "software_name": "xxx",
    "error_log": "…"
  },
  "options": {
    "need_draft": true,
    "top_k": 5
  }
}
```

响应：

```json
{
  "data": {
    "suggestion_id": "uuid",
    "similars": [
      { "title": "…", "url": "https://bbs…/t/…", "score": 0.82 }
    ],
    "draft_markdown": "…",
    "citations": [{ "url": "…", "title": "…" }],
    "status": "ok"
  }
}
```

超时策略：服务端硬超时（如 8s）；超时返回 `status: "timeout"` 且 `similars` 可尽力返回。

### `POST /v1/knowledge/ingest`

版主审核通过后入库（需 `mod`）。

### `GET /v1/knowledge/search`

运维/调试检索；生产对普通用户可关闭。

---

## 3. 积分

### `GET /v1/me/points`

当前用户余额与近 20 条 ledger。

### `POST /v1/points/grant`（内部/管理员）

禁止对公网开放无鉴权。

Webhook 消费论坛 `accepted_answer` 后由 UserBridge 入账。

---

## 4. 软件模块

### `GET /v1/tools`

查询参数：`q` `category` `cursor`

### `GET /v1/tools/{id}`

### `POST /v1/tools`（登录贡献者）

创建 `draft`；发布需审核接口。

### `POST /v1/tools/{id}/publish`（维护者）

---

## 5. 在线分析

### `POST /v1/analysis/uploads/presign`

获取 OSS 预签名上传 URL。

### `POST /v1/analysis/jobs`

```json
{
  "tool_id": "fasta-stats",
  "input_uri": "oss://…",
  "params": {}
}
```

头：`Idempotency-Key: <uuid>`

### `GET /v1/analysis/jobs/{id}`

返回 `status`、进度、错误、产物列表。

### `POST /v1/analysis/jobs/{id}/cancel`

### `GET /v1/analysis/tools`

列出已启用工具及限额。

---

## 6. Webhook（入站：论坛 → 平台）

路径示例：`POST /v1/hooks/forum`

| 事件 | 动作 |
|------|------|
| `topic.created` | 触发 suggest；写 mirror |
| `post.accepted` | 积分入账；候选入库队列 |
| `user.created` | upsert bridge user |

**必须**校验签名（HMAC）与时间窗，防重放。

---

## 6.1 门户过渡接口（当前已实现）

门户在 NodeBB / `/v1` 之前自带一套 JSON 接口，前缀为站点根路径（如 `https://keyantong.zeabur.app`），**不是** `api.keyantong.com/v1`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 校园邮箱注册，发验证码 |
| POST | `/api/auth/verify` | 验证码通过后开始 7 天试用 |
| POST | `/api/auth/login` | 会话 Cookie；设备满员返回 `409 DEVICE_LIMIT` |
| POST | `/api/auth/logout` | 清会话并回首页 |
| GET | `/api/me` | 当前用户与 `entitled` |
| POST | `/api/me/devices` | 注销自己的一台设备 |
| GET | `/api/papers/search` | OpenAlex 题名检索（可匿名） |
| GET | `/api/papers/graph` | 引用邻域；需登录且 `entitled` |
| POST | `/api/tools/rnaseq/run` | 上传表达矩阵和分组 JSON，同步跑 QC/差异/PCA/火山图/热图/韦恩图/可选富集；需登录且 `entitled` |
| GET | `/api/tools/rnaseq/{jobId}/{file}` | 下载该用户自己的分析结果（图、表、`results.zip`）；需登录且 `entitled` |
| POST | `/api/tools/ncbi/sra/prepare` | 校验 BioSample 与 SRA 表并返回 ascp 命令；不落盘私钥；需登录且 `entitled` |
| GET/POST | `/api/internal/users` | 管理端发放永久会员 / 踢设备；`Bearer INTERNAL_API_SECRET` |

错误仍用 `{ error, code? }` 扁平 JSON，与上文 `/v1` 信封并存，待论坛上线后收敛。

---

## 7. 版本与兼容

- URL 含 `/v1`；破坏性变更走 `/v2`  
- 至少保留旧主版本 90 天（公网 API 对外后）  
- OpenAPI 3 文件置于 `services/*/openapi.yaml`（代码阶段）  

## 8. 限流建议（MVP）

| 接口 | 限制 |
|------|------|
| `/ai/suggest` | 10/用户/小时；IP 维度兜底 |
| `/analysis/jobs` | 10/用户/天 |
| 匿名读 | 较高限额 + CDN |

---

## 9. 前端集成注意

- Portal 只消费 `/v1/*`，不爬论坛 HTML  
- 论坛 UI 内嵌 AI 建议优先用插件调 BFF，避免 CORS 混乱  
- 所有外部链接触发 `rel="noopener"`；用户生成内容按安全文档转义  
