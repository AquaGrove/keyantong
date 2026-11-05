# 组学执行与科研资源图鉴

## 本阶段实现范围

门户增加 `/genomes` 植物基因组图鉴、科研网站目录、用户补充/退回修订/后台审核，以及 GWAS 与 BSA 的实验性计算工作台。RNAseq 保持原表达矩阵流程，升级共享环境和错误处理。新增模块使用 PostgreSQL 主库、对象存储私有输入和数据库权威任务队列；RNAseq 任务本阶段仍沿用已有 worker 与文件任务记录。

初始目录 82 条：47 条植物/跨物种基因组入口、35 个科研网站。按官网入口而非“独立物种数”计数，包含同物种不同数据库。覆盖粮食、豆油、蔬菜薯类、果树、经济作物、模式植物和林木等。资源名称、拉丁名、机构、组装版本/版本提示、输入输出、操作步骤、访问要求、许可和来源均结构化保存。植物图标是项目内 SVG，不依赖第三方图标热链。

## 前期项目审计

只读查看用户指定 GWAS/BSA 目录。GWAS `参考文献/07_agent_foundation/registries/adapter_readiness_matrix.tsv` 提供 26 个适配器及证据级别；原 README 与机器表有个别成熟度差异，因此本次按机器表归档，全部在本站标记“待重新验证”，不自动升级为已部署。仅提取自主工程元数据到 `catalog/analysis/research-adapters.json`，未复制论文、第三方二进制、权重或整个研究目录。

CausalBSA 的 `PROJECT_STATUS.md` 明确当前为算法规范阶段，未实现经验证的多倍体因果内核。本次 BSA baseline 独立实现，不复用 DeepBSA 二进制，不声称提供 CausalBSA 的 PIP、credible set 或因果基因。后续需分别实现倍性/池大小、分离机制、LD/注释、不确定性与真实 benchmark。

## 可运行方法与适用边界

| 方法 | 输入 | 步骤与输出 | 边界 |
|---|---|---|---|
| RNAseq 原流程 | 表达矩阵 + 样本分组/对比 JSON | 多对比 DE、PCA、火山/热图、Venn、富集与可追溯报告 | 不把安装 STAR 等软件等同于已经开放 FASTQ 上游一键分析 |
| gwas.plink-linear.v1 | `genotypes.csv`：id,chrom,pos,ref,alt + 样本列，0/1/2；`phenotypes.csv`：sample,trait | MAF/缺失质控、LD 剪枝、PCA 协变量、PLINK 线性关联、BH/Bonferroni、Manhattan/QQ | 二倍体、双等位 SNP、连续性状；不适用于多倍体、强亲缘群体或二分类性状，不是 LMM |
| bsa.delta.v1 | `counts.csv`：chrom,pos,ref_high,alt_high,ref_low,alt_low | 深度过滤、两个 SNP-index、ΔSNP-index、读段 Fisher/BH、非重叠固定窗口均值与扫描图 | 读段计数探索，不等同于生物重复、分离群体 QTL 阈值或因果推断 |

GWAS 最少 12 个样本、5 个 SNP，最多 2000 样本。两条新流程最多 100,000 行，单文件 12 MB、单次请求 20 MB、运行 20 分钟。CSV 坐标为 1-based。原始大规模 VCF/FASTQ、GPU 与复杂多倍体模型需要独立验证的后续适配器/HPC 环境。不能把 8 GB 服务器上的小规模在线限制解读成任意数据量支持。

RNAseq 升级解决：安装真实 R 引擎依赖 statmod 与中文字体；锁定 PyDESeq2/AnnData 兼容版本；显式指定的引擎失败时不再静默换成其他统计方法；auto 模式保留降级原因到 `tables/methods.json`；DESeq2/edgeR/PyDESeq2 拒绝小数 TPM/FPKM 作为原始 counts。

## 扩展契约和环境

`catalog/analysis/methods.json` 统一定义方法 ID、版本、模块、文件清单和数值参数范围；门户表单、API 校验与 worker 白名单共用注册表。`services/omics/tests` 验证注册表与 Python 执行器闭合。新算法必须添加实现与 schema、注明版本及许可、提供正常/异常数据测试、真实软件执行证据和科学适用边界。没有执行证据的方法保留在研究储备表，不能由浏览器请求任意 entrypoint。

`keyantong-omics:20261105` 包含 R/Python 和标准软件环境；现有 RNAseq worker 从该镜像继承。R 包版本由 Debian 安装清单记录，Python 直接依赖固定；发布镜像与结果实现 SHA256/运行清单便于追溯，后续生产发布应保持旧版本可用。未安装有许可限制的 SignalP 等专用软件到公共服务，使用官方网页入口。软件已安装不代表每一种组合流程均已接入或验证。

执行器仅运行审核过的固定参数命令，不给模型 shell，不挂 Docker socket。omics worker 非 root、只读文件系统、临时目录 768 MB、内存 2 GB、CPU 1.5、单进程领取；RNAseq 内存 3 GB、CPU 2、单任务。共享原始数据和参考文件不烘入镜像。结果包含输入哈希、参数、实现哈希、软件清单和运行日志；下载包移除原始基因型、表型与二进制中间数据。

## 数据与调度

`kt_ops.tasks` 保存 owner、method/version/config、内容指纹、私有文件对象 ID、尝试次数、租约、状态和结果 ID。同输入参数的活动/成功任务可复用，失败后允许新任务。上传先保留 `omics.prepare` 任务槽，私有输入完整性核验成功后才变为可执行 `omics`，防止 worker 抢到半成品；超过 30 分钟未准备好的任务标失败。

提交通过事务 advisory lock 限制每用户 2 个活动任务、全站 8 个。worker 使用 SKIP LOCKED 独占领取，每 20 秒心跳，2 分钟租约；进程故障可重领，最终结果用租约令牌检查防止旧进程覆盖。显式数据错误标失败。数据库 outbox 将通知事件写入 Redis；本版 worker 通过 PostgreSQL 轮询领取任务，后续可订阅通知减少轮询，不能依赖 Redis 作为任务权威。停止/超时/租约丢失时终止整个受控进程组。输入输出 S3 使用 owner 复合外键和 RLS，下载由门户校验身份后代理流式传输，不把内部对象域名发给用户。

## 社区补充与管理员审核

`kt_catalog.resources` 保存内容、规范 HTTPS URL、owner、pending/published/rejected/withdrawn 状态、版本及审核说明；`kt_catalog.reviews` 为追加审核日志。匿名/普通用户仅能读已发布条目，投稿者可查自己的未公开记录。普通校园用户贡献不要求有效计算会员。每天最多新提交 10 条，同网址禁止重复。种子目录由维护脚本导入，不覆盖人工审核决定。

必填说明包括用途、来源机构、输入输出、访问和许可、至少 20 字操作说明；植物还需物种与拉丁名。提交者无法设置发布状态或审核字段。管理员核对官网/许可后显式通过，并填写至少 10 字审核意见；版本锁避免并发覆盖。退回/下架后原投稿者可修订重提，旧审核日志保留，修订版本回到待审。已发布资源的维护通过管理员下架后修订，避免绕过审核直接改公开链接。

只接受公开 HTTPS 格式，拒绝凭据、端口、IP 与本地域名；用户提交不触发服务器抓取，避免 SSRF。自动链接检查只针对维护者整理的固定种子。可达性不等同于许可或科学有效性，受限/超时来源会显示探测提示。已发现的 404 旧物种路径改用相应官方数据库入口。用户点击外链前仍需核对来源及版本。

后台 `apps/admin /resources` 使用已有管理员 cookie，经内部鉴权代理门户审核 API。单独部署在云主机 `127.0.0.1:3001`，没有公开管理端口；可通过 SSH 本地转发打开 `http://localhost:3001/resources`，使用原管理口令。后台容器只读取管理凭据，不持数据库迁移密钥。

## 部署和恢复

独立发布目录 `/opt/keyantong-omics-20261105`。在已有 prod + storage 配置上追加 `infra/docker-compose.omics.yml`。云端保留旧门户和 RNAseq 镜像。上线前执行私密备份，独立验证库先应用迁移 004/005/006，导入目录并测试；生产仅增表/策略，不改原账号内容。启动前确认没有正在运行的 RNAseq 任务。

`infra/deploy-up.sh` 识别服务器 `storage-secrets/omics-enabled` 标记，加载组学覆盖配置；先构建公共镜像再构建继承它的 RNAseq 镜像。需要回退时保留数据库增量表，停止新计算 worker，使用上一版门户/worker 镜像；已完成的目录审核和任务数据不删除。每日备份覆盖新 PostgreSQL 表与对象卷。当前仍为同机备份，异地灾备尚未接入。

## 来源

- [Spud DB DM v6.1](https://spuddb.uga.edu/dm_v6_1_download.shtml)：指定的马铃薯官方组装入口。
- [Ensembl Plants](https://plants.ensembl.org/)、[RAP-DB](https://rapdb.dna.naro.go.jp/)、[Lettuce DB](https://db.cngb.org/lettuce/download)、[LIS 鹰嘴豆](https://data.legumeinfo.org/Cicer/arietinum/)、[GDR 草莓](https://www.rosaceae.org/organism/Fragaria/vesca?pane=overview)：物种资源与修复路径依据。
- [PlantTFDB](https://planttfdb.gao-lab.org/prediction.php)、[SignalP 官方服务](https://services.healthtech.dtu.dk/services/SignalP-6.0/)、[DeepTMHMM 官方服务](https://services.healthtech.dtu.dk/services/DeepTMHMM-1.0/)：转录因子、信号肽与拓扑服务。
- [PLINK 1.9 关联文档](https://www.cog-genomics.org/plink/1.9/assoc)、[群体结构文档](https://www.cog-genomics.org/plink2/strat)：原生命令与适用范围。

备份与计算互斥：`kt_ops.execution_control` 暂停新任务准备和 worker 领取，已有计算与输入准备完成后才停对象服务做快照；备份结束检测 S3 端口恢复后解除暂停。入口保留排队/可重试提示，不通过强杀分析来备份。恢复生产 dump 后需先恢复对象卷、确认服务就绪，再由维护账号将 execution_control 的 omics.paused 设回 false。

## 云端实施记录（2026-11-05，北京时间）

- 正式站点 `/genomes`、`/tools`、`/analysis`、`/analysis/gwas`、`/analysis/bsaseq`、`/analysis/rnaseq`、首页及科研论坛均返回 HTTP 200；身份健康检查保持 PostgreSQL。
- 目录实际读取 82 条：47 条基因组入口、35 个科研网站。原有账号仍为 2 个；运行时认证登录没有 superuser/BYPASSRLS 权限，门户不持迁移所有者密码。
- 新基线与注册表 5 项测试通过；RNAseq 11 项测试通过，包括所有可用原生引擎。多组 RNAseq smoke 通过并使用真实 r_limma；中文缺字告警为 0。
- 资源/任务直接集成 11 项检查通过；最终门户+后台的 10 项端到端检查通过，包含退回修订再审核、两个方法真实计算、私有结果下载和跨用户拒绝。
- 备份门控检查通过：暂停阻止新准备/领取，恢复后队列继续计算。上线后实际备份已恢复到 `keyantong_restorecheck_omics`，核对 2 个用户与 82 条资源；生产暂停标志恢复为 false。
- 上线前备份 `/data/keyantong/backups/storage-20261104T194352Z`；上线后备份 `/data/keyantong/backups/storage-20261104T194652Z`，目录命名使用 UTC。每日 timer 已转为当前规范部署目录中的备份脚本。
- 旧镜像：`keyantong-portal:pre-omics-20261105`、`keyantong-rnaseq-worker:pre-omics-20261105`。临时验证门户、审核端和 worker 容器已移除，隔离验证库保留。

管理端访问示例（服务器不开放公网 3001）：

```sh
ssh -N -L 13001:127.0.0.1:3001 ubuntu@43.156.95.209
# 然后在本机打开 http://localhost:13001/resources，使用原管理口令。
```

此轮没有宣称 26 个研究适配器已经全部部署，没有执行真实数据 benchmark，也没有训练模型。共享 CPU 队列当前承载两条已经实现的基线；后续独立 GPU/HPC 环境还需扩展对应的任务路由、实现和集成验证。
