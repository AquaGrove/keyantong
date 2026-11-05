# 28 · 科研互助模块与专属角色

2026-11-05。原则：一切皆可求、皆可响应；每个人都可以贡献经验、工具与协作能力。

## 入口

- `/literature`：文献发现 + 站内文献求助广场；`/papers` 是独立引用网络工作台。浏览公开，图谱限流；登录可发帖/回复，不要求会员。
- `/tools`：插件、软件、在线网站的筛选/搜索；保留 `/community/tools` 分享板。RNAseq 不再混在工具目录。
- `/analysis`：RNAseq / BSAseq / GWAS / 单细胞；`/analysis/rnaseq` 复用已有 runner，旧路径跳转；其他方向明确尚未接入计算，可发起协作。
- `/community`：科研日常、瓶颈、心得与协作；首页居中显示同一个站内动态源。

论坛新增 `/api/community/posts` 与 `/api/community/posts/[id]`，公开浏览、登录发布与回复、发起人采纳。邮箱脱敏、作者 ID 不对外输出、文本和外链校验、限流、原子 JSON 写入；无虚构用户动态。数据文件 `$DATA_DIR/research-community.json`。当前为单进程 JSON 存储，横向多实例写入前应迁移数据库。

## 文献网络

设计参考曾记录的 Connected Papers / ResearchRabbit / Litmaps，但只使用 OpenAlex 真实引用边，不把它宣传为相似度图。加入连续节点拓展、邻域之间的引用边、网络/时间线/列表切换、缩放、OA 筛选、文献求助跳转，最多 160 篇。参考文献/被引请求并行，超时/未配置 key/部分邻域失败可见。不预填虚构论文或假引用。

## DeepSeek Harness 专属角色

原有关键词匹配会绕过角色模型并返回固定清单；现在改为始终由角色引擎提供个性化回答，平台模块清单作为事实输入，相关入口附在回答后。

- 配置 `HARNESS_WORKER_URL` 与 `HARNESS_WORKER_TOKEN` 后，门户调用新增的内部 `/v1/turn` adapter；这不是猜测的 dsh Web API。
- adapter 使用项目固定版本 `@deepseek-ai/dsh-sdk-client@0.2.1-rc.5` 与 `sdk-minimal`，按 `SHA256(userId + NUL + agentId)` 创建独立 home、workspace 与持久会话，调用官方 resumeSession/run。
- 公共角色的 profile 禁用 shell、文件/图片读取、目录工具与会话日志上传插件。运维 Harness 的数据卷与会话不挂入公共角色服务。角色目前支持思路、规划和上下文协作，不会自行跑分析、发帖或上传。
- Compose 新增可选 `harness-workers` profile，独立数据卷、内部网络、无宿主机公开端口、令牌鉴权、同一角色串行、全站两路并发、90 秒界限及清理。
- 使用既有会员额度并记录估计用量；尚未汇总官方 SDK 全部内部调用的精确 token，用户点数为估算，不能当供应商精确账单。
- 未配置 adapter 时明确标示基础网关模式；配置后连接故障直接报错，不静默伪装已在 Harness 上运行。
- 角色创建提供文献搭子、组学助手、排错搭档与宠物同伴模板；用户可自定义名称、人设、研究目标与擅长领域，保留每角色独立记忆。

部署新增服务：配置服务专用 token、供应商 key/model/base URL，设置门户 `HARNESS_WORKER_URL=http://harness-workers:3090`，建立数据目录并按容器用户权限授权，然后 `docker compose ... --profile harness-workers up -d --build`。不自动从运维 Web UI 复制密钥。此前“已部署运维 Harness”不意味着新的公共角色 adapter 已上线；本轮不修改远程部署。

来源：[Harness 官方 SDK](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/sdk/client)、本次核对的 npm 0.2.1-rc.5 发布包类型与 minimal profile 配置、[官方安全说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md)。

## 本轮验证

门户生产构建及类型检查通过。隔离测试库中使用过期会员状态的普通登录账户，验证首页发帖、他人回复、发起人采纳、非发起人不能采纳、匿名不能发帖、工具贡献无需会员、角色详情跨账户不可读、AI 对话仍遵守会员计算权限。20 个页面 × 320/390/768/1440px 共 80 项浏览器布局检查无横向溢出及 pageerror。文献搜索、节点扩展、时间线/列表切换使用明确的测试 fixture 验证交互，不冒充真实文献或外部服务联通结果。Harness 使用 fake SDK 测试鉴权、隔离、恢复及 close，未调用真实供应商。
