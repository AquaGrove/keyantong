# 对话即操作：科研通门户转型

## 产品约定

首页以一条对话和一张能力插画为中心。用户描述目标，助手负责查找资料、切换内容空间、补齐参数和调用已接入的服务。内容空间展示真实资料、任务状态与结果，不再显示公共站点导航、模块菜单、返回按钮、筛选表单或操作向导。文件拖入/选择与结果下载保留直接操作；发送、唤起/收起对话为必要的对话控件。后台管理端仍使用审核界面，与公共门户分离。

所有公共页面共享根级 ConversationProvider。软跳转保留消息、文件对象、参数和草稿；消息按当前账号分别保存在当前标签页 sessionStorage（最多80条），退出或更换账号时清理私人消息和附件。文件字节不写浏览器持久存储，刷新后需要重新拖入。密码/验证码通过专用隐私输入直接进入认证 API，不加入聊天记录或模型上下文。NCBI 私钥不能作为附件上传。

## 已接通的行为

- 免费自然语言跳转、基因组/科研网站检索、打开实际结果对应的官方来源。
- OpenAlex 文献搜索、实际引用关系网络/时间线；不伪造缺失关系。
- RNAseq、GWAS、BSA：识别文件角色、对话修改参数、显式开始后调用既有任务 API、状态更新与私有结果下载。计算权限和资源限制继续由服务端检查。单细胞及其他计划方法明确提示尚未接入。
- 四倍体/二分类 GWAS 与高级算法请求阻止落入现有二倍体连续性状基线；只有用户重新明确二倍体后才解除倍性阻断，不自动改变研究假设。
- 科研动态和回应：对话收集正文、完整预览、明确确认后发布。
- 基因组/工具资源投稿及退回修订：收集来源、版本、输入输出、操作步骤和许可，确认后进入既有 PostgreSQL 审核队列。
- 登录/注册/退出、设备状态与撤销、通知和投稿进度；专属角色创建及既有角色聊天 API。
- NCBI 元数据校验及本机助手文件下载；真实 NCBI 登录、密钥及最终提交仍遵循本机助手流程，当前对话界面不能宣称完成了外部最终提交。

旧工具互助数据/API保留，尚未统一进新的科研动态数据模型；不在此次交互改版中进行无审核的数据合并。论坛和角色存储仍沿用原有文件存储，后续按统一存储计划迁移，不能部署多个文件写入副本。

## 执行边界

`/api/agent` 输出允许列表中的结构化命令。确定性规则优先，复杂表达可调用现有模型网关；模型没有 shell、任意 URL API 或数据库权限。页面显示数据仍由原业务 API 读取，服务端依据真实登录身份检查权限，浏览器传来的身份和上下文不构成授权。

公开写入、角色创建、设备撤销等先生成绑定当前用户的10分钟 HMAC操作凭据，用户以“确认提交/确认发布”等明确措辞执行。`007_agent_actions.sql`保存受 RLS 保护的执行结果，使用用户级事务锁和确定性业务 ID 防止并发/重试重复写入。资源提交使用同一数据库事务，论坛/角色跨文件存储通过确定性 ID 做重试去重；这不是跨数据库和文件系统的分布式事务。

导航、阅读和参数准备不要求会员；昂贵计算仍由各业务 API 检查。模型规划有请求和日额度限制。未接入方法不生成成功状态；外部网页不能自动获得访问本站账户的能力。

## 插画资产

- 资产：`apps/portal/public/images/conversation-research-v1.png`（1536×1024），Next Image 响应式显示。
- 模式：内置 image generation，生成全新插画；未改写现有图片。
- 提示词要点：ivory and sage editorial botanical illustration, one central conversation bubble connecting literature, potato genome/DNA, expression heatmap and association plot, research tools and helping hands; warm human scientific mutual aid, fine texture and generous negative space, no text, no labels, no interface menus.
- 用途：在首页表达“一次对话连接科研互助”，不用能力卡片充当导航。

## 验证

`node --import tsx db/tests/agent-planner.ts`：自然语言导航、PCA/MAF参数、四倍体阻断、了解方法不触发运行、角色路由、签名用户隔离/防篡改。

`TEST_PORTAL_URL=http://keyantong-portal-validation:3000 node db/tests/agent-http.mjs`：仅允许隔离验证容器，覆盖注册登录、真实草稿、错误确认/跨用户拦截、5次并发确认、动态与回应重复确认去重。合成测试数据不得写入生产库。

浏览器验证：从首页查马铃薯资料、切换 GWAS、选择合成输入、修改 PCA、对话回首页，文件和消息保留；窄屏无横向溢出，公共页面无 nav。

## 2026-11-05 上线记录

- 生产门户镜像：`keyantong-portal:conversation-20261105`；覆盖配置为 `infra/docker-compose.conversation.yml`，`conversation-enabled` 标记使后续标准部署继续使用此版本。
- 新增迁移：007；生产原有2个账号、82条资源均保留，测试投稿和动态只写隔离环境。
- 隔离HTTP检查14项通过，包括真实GWAS/BSA计算、ZIP下载和跨账号结果隔离；最终镜像检查首页插画优化接口200。
- 切换前备份：`/data/keyantong/backups/storage-20261104T203600Z`，完整SHA256校验通过（文件名为UTC，日期对应北京时间11月5日）。
- 旧门户镜像保留为 `keyantong-portal:pre-conversation-20261105`。紧急回退可停止使用最后的对话覆盖配置，沿用 omics 覆盖并仅重建门户容器；007为附加表，可保留，不回滚身份或业务数据。
