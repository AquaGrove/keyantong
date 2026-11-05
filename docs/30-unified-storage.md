# 统一存储：第一阶段用户与权限

本阶段将用户、会员状态、设备、验证码、登录会话迁移到 PostgreSQL；社区、文献图谱、工具分享、打工人会话和 RNAseq 任务仍沿用原存储，下一阶段逐模块迁移。禁止把“预留表已存在”当作这些模块已经完成迁移。

## 存储边界

- PostgreSQL 16：身份和关联关系的权威源；后续模块通过稳定用户 ID 关联。保留原始用户 ID、密码哈希、校园验证、会员日期和设备 ID，不重置密码。
- Redis 7：任务唤醒事件流。数据库事务写业务记录和 outbox，dispatcher 使用租约、SKIP LOCKED、退避重试发送事件。允许重复投递；消费者用数据库任务 ID 和租约去重，Redis 丢失不代表任务丢失。独立事件流限制约 10,000 条，仅用于唤醒，业务任务必须轮询 PostgreSQL 补偿。
- S3 兼容对象存储：私有 SeaweedFS 4.28，固定镜像 digest，分管理员、生产桶、验证桶三组凭据，版本控制已开启。无宿主机端口映射，无匿名读写。现阶段 SDK 基础层可用，尚未开放公众上传 API，现有模块附件尚未批量迁入。

选择 SeaweedFS 的依据是当前官方源支持 S3 版本、校验和和预签名 URL；MinIO 社区分发已转为源码形式，本次不依赖其失效的官方二进制下载。
来源：[SeaweedFS 项目](https://github.com/seaweedfs/seaweedfs)、[4.28 官方镜像](https://hub.docker.com/layers/chrislusf/seaweedfs/4.28/images/sha256-8e7868bb29054e9f34724113cf6952954b60fe29da179580061654c1f3e5a35f)、[MinIO 官方说明](https://github.com/minio/minio)。

## 权限和关联

`DATABASE_AUTH_URL` 仅继承 `kt_auth_service`，身份操作只在服务端认证模块执行。`DATABASE_APP_URL` 仅继承 `kt_app`，不可读取用户密码、验证码和会话表。`DATABASE_WORKER_URL` 仅继承 `kt_dispatcher`，仅可调度 outbox/tasks。三个登录都不是表所有者、superuser 或 BYPASSRLS；所有者连接仅进入一次性迁移容器。

对象、知识来源、切片、训练集、任务都启用 FORCE RLS，以事务内 `kt.actor_id` 约束 owner。actor 必须由服务端已认证的 currentUser 提供，不能信任请求体中的 owner_id。连接池事务结束后上下文自动清除。应用登录是可信服务端身份，持有连接串者可设置 actor；RLS 不代替服务端认证。跨用户对象关联用 `(object_id,owner_id)` 复合外键约束，避免绕过所有权的附件引用。

校园邮箱验证与会员计算规则保持现有产品行为。会员管理继续走已有内部管理鉴权，审计记录标记 internal-admin；未增加公开的角色提升接口。用户角色预留 member/moderator/admin，尚未启用完整可配置 RBAC。

验证码保存带密钥的 HMAC，不保存明文，最多五次验证；用户行锁保证并发验证只消费一次、试用不重复延长。设备上限在用户事务锁内检查。新 cookie 是随机服务端会话，数据库只保存 token 哈希；撤销设备同时撤销会话。旧 JSON 签名 cookie 在切换后失效，需要用户重新登录，密码保留。

明确设置 `AUTH_STORE=postgres` 才切换。数据库失败返回错误，不回退 JSON、不创建空用户文件。健康检查访问身份表，数据库不可用返回 503。

## 迁移、备份与回滚

云端发布目录 `/opt/keyantong-storage-20261105`；凭据 `/data/keyantong/storage-secrets` 权限 0700/0600，仅服务器保存。不能打印、提交或复制到浏览器。迁移镜像 `keyantong-storage-ops:20261105`；门户 `keyantong-portal:storage-20261105`。SQL 由独立命令执行，不在 Next.js 启动时执行；迁移文件 SHA256 入库并锁定，旧文件变动立即失败。

1. 独立 `keyantong_validation` 库运行迁移、真实 PostgreSQL 测试、真实 S3 测试和隔离门户 HTTP 流程。测试脚本强制拒绝生产库。
2. `infra/storage/backup.sh` 保存 portal 文件、users.json、数据库 custom-format dump、角色定义、运行密钥和对象数据；文件只在服务器私密目录保存。生成 SHA256 清单，执行 archive list 校验。对象服务停机快照后自动恢复。切换备份需先停止门户，避免旧 JSON 并发变化。
3. 原门户暂停后从备份 `users.json` 事务导入。非空目标拒绝覆盖；同一哈希导入可安全重试。验证脚本逐字段核对密码哈希、会员和设备，而不仅比较数量。
4. 使用 `infra/docker-compose.storage.yml` 覆盖启动门户与 dispatcher。门户显式清空旧所有者 DATABASE_URL 和 POSTGRES_PASSWORD。上线健康验证后再恢复服务。
5. 回滚前必须停止新门户写入，以 `db/scripts/export-users.ts NEW_FILE` 导出最新数据库用户，核验后替换 legacy users.json，再启动旧镜像。不能拿迁移前旧 JSON 覆盖上线后的新注册或会员变更。验证码和新会话在回滚时失效。若数据库本身不可用，应优先恢复数据库备份，不能静默启用旧 JSON。

`restore-check.py` 把 PostgreSQL 备份真正还原到独立 `keyantong_restorecheck`，拒绝覆盖已有库。恢复演练库不向业务开放。全机灾难恢复还需使用 globals.sql/私密凭据恢复服务登录、恢复对象卷，再运行迁移健康检查。

每日备份由 systemd timer 在 UTC 03:15（北京时间 11:15）执行，失败记录在 journal；没有静默跳过。当前备份在同一服务器，未配置异地存储与告警通道，不能防止整机磁盘丢失；后续需要用户选定外部备份桶/其他服务器。暂不自动删除备份。每日备份中其他仍用 JSON 的模块是在线文件快照，要求严格跨模块时间点一致的恢复时需维护窗口停止所有写入者。Redis 唤醒流不作为恢复依据。

## 任务和 RAG/训练预留

`kt_ops.tasks` 有 owner、kind、幂等键、输入/输出对象、状态、尝试次数、租约与版本。独占领取、心跳、过期重领、最大重试、旧租约拒绝完成都由 PostgreSQL 判断。现有 RNAseq 文件轮询 worker 本阶段尚未切换，不能同时对同一任务运行两套领取逻辑。业务 worker 必须幂等执行外部副作用，数据库租约不能保证外部系统 exactly-once。

`kt_knowledge.sources` 记录原模块来源、版本、内容哈希、对象、许可、隐私、审核、删除、授权版本/日期；allow_rag/allow_training 默认 false。chunk 保存切片定位及 embedding 模型/版本/维度/对象引用。训练集与成员保存可追溯数据版本。插入训练成员要求已审核且授权；导出视图再次过滤实时授权和删除状态，撤回授权立即排除。尚未安装 pgvector、建立嵌入索引、构建 RAG 或训练模型。后续模型产物还需记录数据集 manifest、评估和发布审计。

NCBI 密码、cookies 和 ascp 私钥仍只保留在用户本机，不进入对象存储、知识库或训练数据。

## 验证

- TypeScript 检查、云端 Next.js 生产构建。
- PostgreSQL/S3 集成检查：并发消费验证码、设备上限、登录和撤销、会员写入、身份表拒绝 app 访问、任务去重和并发领取、租约令牌、RLS 跨用户隔离、训练未授权拒绝及撤回、校验和上传下载。
- 隔离门户 HTTP：注册、验证、登录、个人信息、登出后旧 token 不再可用。
- 生产迁移逐字段核验及备份实际还原结果，见部署完成后的记录。

## 本次云端实施记录（2026-11-05，北京时间）

- 线上 HTTPS `/api/health` 已返回 `{"ok":true,"service":"portal","identity":"postgres"}`。
- 导入并逐字段核验：2 个用户、2 台设备，原始 ID/密码哈希/会员与验证日期全部保留。
- 隔离库集成检查 17 项、最终门户 HTTP 流程 7 项通过；Redis 实际收到隔离事件。数据库故障实例的健康与登录接口都返回 503。
- 对象存储停启后内容读取一致，私有桶已开启版本控制。
- 切换前备份：`/data/keyantong/backups/storage-20261104T185642Z`；迁移后备份：`/data/keyantong/backups/storage-20261104T185751Z`。目录命名使用 UTC。迁移后 dump 已真正还原到独立库，核对 2 个用户。
- 每日备份 timer 已启用，首次计划北京时间 2026-11-05 11:16 左右（含随机延迟）。旧门户镜像保留为 `keyantong-portal:pre-storage-20261105`，规范部署入口已包含存储覆盖配置。
- 本次没有重置真实用户密码、没有使用真实用户账号执行测试、没有启动 RAG 或训练任务。
