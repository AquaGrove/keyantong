> 2026-11-05：根据用户新要求，首页增加四个模块入口及居中科研广场；早期“隐藏一级模块导航”的约定已被 [28](./28-research-commons.md) 与 ADR-009 更新。

# 24 · 聊天首页与中英切换

**状态：** Accepted（MVP）

## 产品

- 首页极简：品牌标识、简介 + 登录 + **中/英切换**；文献网 / 社区 / 工具等一级模块从首页导航隐藏。
- 中央聊天框调用 `/api/ai/dispatch`：规则意图识别（rnaseq / ncbi / community / tools / papers / …）+ 可选会员 LLM 增强（硅基流动网关）。
- 「下一步」按钮跳转对应模块（如 `/tools/rnaseq`）。
- 通知中心 `/notifications`：分析结果 / 站内通知 / 最新热点。

## 技术

- 文案：`apps/portal/src/lib/i18n/dictionary.ts`；cookie + localStorage 键 `kt_locale`。
- 意图：`apps/portal/src/lib/dispatch/intent.ts`。
- 访客可用规则引导（不耗供应商额度）；登录会员且 `enhance` 时走既有配额账本。

## 2026-11-05 视觉更新

首页继续以对话为主；内页增加品牌返回入口与文献/工具/社区链接。首页、AI 和角色聊天提供可点击发送按钮，回车不会在中文输入法选字时误触发。全局视觉与验收范围见 [27 · UI 改造](./27-ui-refresh.md)。
