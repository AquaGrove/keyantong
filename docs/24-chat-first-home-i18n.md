# 24 · 聊天首页与中英切换

**状态：** Accepted（MVP）

## 产品

- 首页极简：品牌简介 + 登录 + **中/英切换**；文献网 / 社区 / 工具等一级模块从首页导航隐藏。
- 中央聊天框调用 `/api/ai/dispatch`：规则意图识别（rnaseq / ncbi / community / tools / papers / …）+ 可选会员 LLM 增强（硅基流动网关）。
- 「下一步」按钮跳转对应模块（如 `/tools/rnaseq`）。
- 通知中心 `/notifications`：分析结果 / 站内通知 / 最新热点。

## 技术

- 文案：`apps/portal/src/lib/i18n/dictionary.ts`；cookie + localStorage 键 `kt_locale`。
- 意图：`apps/portal/src/lib/dispatch/intent.ts`。
- 访客可用规则引导（不耗供应商额度）；登录会员且 `enhance` 时走既有配额账本。
