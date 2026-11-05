# 18 · 开源门户安全基线（落地）

**状态：** Accepted  
**版本：** v0.1  
**上位文档：** [11 安全与合规](./11-security.md)  
**范围：** `apps/portal` 及与之相连的公开 API；论坛/Worker 成长期另册。

## 1. 威胁模型（短）

| 资产 | 威胁 | 缓解（已做 / 待运维） |
|------|------|------------------------|
| 会话 Cookie | 窃取、固定 | HttpOnly + SameSite=Lax + Secure(prod)；短 TTL；**待**：轮换 `USER_SESSION_SECRET`、CSP 收紧 |
| 校园账号 | 撞库、枚举 | 密码哈希；设备数限制；**待**：登录/注册 Redis 限流、验证码、审计 |
| 社区 UGC | XSS、钓鱼链、盗版导流 | 纯文本消毒去 `<>`；外链仅 http(s)；黑名单域；盗版话术拒绝；React 文本节点默认转义 |
| 写接口 | CSRF、刷帖 | SameSite Cookie；同站 fetch；进程内 rate limit；**待**：Origin 校验双保险、Redis 限流 |
| 内部 API | 未授权列举用户 | `assertInternal` + middleware 无密钥直接 401；**勿**对公网暴露无密钥的 admin |
| 工具 Job | 路径穿越、滥用算力 | 既有 job 目录隔离与 soft quota；**待**：强配额、沙箱 |
| 供应链 | 依赖恶意包、密钥进库 | lockfile；`.env` gitignore；**待**：CI `pnpm audit`、gitleaks/trufflehog、Dependabot |
| 主机 | 扫站、CC | **待**：WAF / CDN、TLS、磁盘与备份加密 |

假设：**所有 UGC 与外链不可信**；开源不代表可放松默认拒绝。

## 2. 已在代码落地

1. **安全响应头**（`apps/portal/next.config.ts`）：`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, 基线 CSP（仍含 Next 所需 unsafe-inline/eval，后续改 nonce）, `poweredByHeader: false`。
2. **Middleware**（`apps/portal/src/middleware.ts`）：`/api/internal/*` 无 Authorization / `x-internal-secret` 直接 401。
3. **校验库**（`apps/portal/src/lib/security/`）：
   - `sanitizePlainText` / `sanitizeMultiline`：去控制符与 `<>`
   - `validatePublicHttpUrl`：仅 http(s)，拒 javascript/data、userinfo、localhost、裸 IP、盗版域子串
   - `looksLikePiracySolicitation`：拒绝明显盗版 PDF 导流文案
   - `rateLimit` + `clientIp`：单机滑动窗口（社区读写接口）
4. **社区工具 API**：读公开限流；写必须 `currentUser` + `isEntitled`；响应不回传 `authorId`（仅脱敏 `authorLabel`）。
5. **文献红线**：工具分享文案与校验与文献模块一致强调禁止 PDF 互传 / 盗版站。

## 3. 身份 / 会话注意点（现状缺口）

- Session 为 HMAC token in cookie（见 `user-session.ts`）；生产必须设置强随机 `USER_SESSION_SECRET`，禁止使用代码内 dev 默认值。
- 登录接口尚无独立 rate limit（**待加**，与注册/发码共用 Redis）。
- CSRF：依赖 SameSite；若未来跨站前端，需 CSRF token。

## 4. 上传 / 外链

- 本站社区 **不接收** 工具安装包或 PDF 上传（只存外链字符串）。
- 外链点击使用 `rel="noopener noreferrer nofollow"` + 新窗口。

## 5. 密钥与开源仓库约定

- 禁止提交 `.env`、私钥、云厂商 AK/SK、Aspera 口令。
- PR 检查：若 diff 含 `SECRET=` / `BEGIN PRIVATE KEY` 必须拒合。
- 泄漏：立即轮换并写 SECURITY 响应流程（见根目录 `SECURITY.md`）。

## 6. 仍待运维 / 成长期

| 项 | 说明 |
|----|------|
| WAF / CDN | 挡 CC 与常见注入噪声 |
| Redis 限流 | 替换进程内 Map，多实例一致 |
| 登录/发码限流与验证码 | 防撞库 |
| CSP nonce | 去掉 script `unsafe-inline` / `unsafe-eval` |
| 密钥轮换演练 | 季度一次 |
| CI 审计 | `pnpm audit`、密钥扫描 action |
| 附件杀毒与 Worker 沙箱 | 分析链路 |
| 正式隐私政策页 | 上线前 |

## 7. 与工具分享的关系

工具分享是 UGC + 外链高风险面，故作为第一批强制走本基线的模块；后续论坛对接时 **不得** 弱化 URL 策略与盗版拒绝逻辑。
