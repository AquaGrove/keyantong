# 16 · 轻量云服务器选型（转录组 + NCBI + 门户）

**状态：** Accepted（实践建议）  
**版本：** v0.1  
**更新：** 2026-11-04（Asia/Shanghai）  
**关联：** [08-infrastructure](./08-infrastructure.md)、[15-rnaseq-ncbi-tools](./15-rnaseq-ncbi-tools.md)

面向「国内轻量应用服务器 / 轻量云」部署科研通：**Next 门户 + 管理端**、**文件型 Job**（RNAseq / NCBI）、可选 **Postgres/Redis**（compose）、本机式 **R DE**（limma/edgeR/DESeq2）与可选 **ascp**。不含自托管大模型 GPU。

## 1. 负载画像（决定规格）

| 负载 | 特征 | 资源敏感点 |
|------|------|------------|
| Portal / Admin（Next 15） | 多为 SSR/API，内存常驻 | RAM、少量 CPU |
| RNAseq Job | 矩阵读入 + R/Python DE + 出图 | **CPU + RAM**；单 Job 峰值常 2–6 GB（视基因数/样本数） |
| 注释富集 | 本地 TSV 超几何 | RAM（人类 gene2go 数十 MB 级可接受） |
| NCBI ascp | 出网带宽 + 磁盘暂存 | **带宽 / 磁盘**；密钥不落库 |
| Postgres + Redis | 会话/元数据 | 磁盘 IO、0.5–1.5 GB RAM |
| NodeBB（若同机） | 论坛常驻 | 另加 2–3.5 GB（见 doc 08） |

文件型异步队列在**同一进程/同机**轮询时，并发一高就容易 OOM；MVP 必须用软并发上限（当前门户已有提示）。

## 2. 推荐规格表

### 2.1 MVP / 校园试用（低流量）

**目标：** 演示 + 少量师生试用；同时跑 **1** 个 RNAseq Job；NCBI 以校验 + 命令生成为主，真 ascp 偶发。

| 项 | 建议 |
|----|------|
| **机型** | 腾讯云 / 阿里云 **轻量应用服务器**，或同级「轻量云」 |
| **vCPU** | **2 核** |
| **RAM** | **4 GB**（若坚持同机跑 R DE，强烈建议直接 **8 GB**） |
| **磁盘** | **80–100 GB SSD**（系统 + Docker 镜像 + Job 暂存；注释 TSV 另占 ~0.1–0.5 GB） |
| **带宽** | **5 Mbps** 够门户；若本机 ascp 传测序文件，升 **10–30 Mbps** 或走对象存储中转 |
| **OS** | **Ubuntu 22.04 LTS**（或 24.04 LTS） |
| **并发 RNAseq** | **1**（队列排队；软上限 1–2） |
| **部署形态** | **Docker Compose** 跑 Postgres/Redis；Portal 可用 Node 直接 `pnpm start` 或容器；R/Python worker **同机** |
| **是否拆 Worker** | **否**（成本优先） |
| **Zeabur vs 轻量云** | **门户可放 Zeabur**（无状态、好发版）；**Job / R / 注释 / ascp / DB 放国内轻量云**（延迟、备案、大文件）。纯试用也可「全家桶」挤一台轻量云。 |
| **费用意识** | 选轻量包年；先 2C8G 再谈升配，比 2C4G 反复 OOM 更省时间 |

**2C4G 能上线吗？** 只能跑门户 + 极轻 Job，或把 DE 限制为 `limma_like`/`welch` 且关重图。**有 R limma/DESeq2 的真实矩阵，请按 2C8G 起步。**

### 2.2 小团队生产（教研组 / 实验室小站）

**目标：** 日常 5–30 活跃用户；RNAseq 排队；偶发并行；NCBI 真传在受控窗口进行。

| 项 | 建议 |
|----|------|
| **机型** | 轻量应用服务器 **或** 同价位云服务器（需安全组/快照时更灵活） |
| **vCPU** | **4 核** |
| **RAM** | **16 GB**（同机 Portal + PG + Redis + 2 个 DE Job 余量） |
| **磁盘** | **200 GB SSD** 起；Job 产物与上传 **务必对象存储**（COS/OSS），系统盘只留热数据 |
| **带宽** | **10–20 Mbps**；ascp/大文件走对象存储或夜间窗口 |
| **OS** | Ubuntu 22.04/24.04 LTS + Docker |
| **并发 RNAseq** | **2**（硬上限）；第 3 个入队等待；单 Job 内存帽（cgroup/`ulimit`） |
| **是否拆 Worker** | **建议拆**：业务机 2–4C/8G（Portal+PG+Redis+反代）；**Worker 机 4C/16G**（R、注释、Job 目录）。MVP 过后再拆亦可。 |
| **Zeabur** | Portal/Admin 继续可用 Zeabur；**分析 Worker 不要放 Zeabur 无持久盘套餐**（注释与 Job 需要持久卷） |
| **备份** | 每日 PG 逻辑备份 + 对象存储版本；Job 结果 7–30 天生命周期 |

### 2.3 对照一览

| 场景 | vCPU | RAM | 磁盘 | 带宽 | 同机组件 | RNAseq 并发 | 备注 |
|------|------|-----|------|------|----------|-------------|------|
| 极简演示 | 2 | 4G | 80G | 3–5M | Portal only | 0–1（Python DE） | 勿同机 NodeBB+R |
| **MVP 推荐** | **2** | **8G** | **100G** | **5–10M** | Portal+PG+Redis+R | **1** | 校园试用甜点 |
| 小团队 | 4 | 16G | 200G+对象存储 | 10–20M | 可拆 Worker | 2 | 生产起步 |
| 含论坛同机 | 4 | 16G+ | 200G | 10M+ | +NodeBB | 1 | 论坛另占 2–3.5G |

## 3. Docker vs 裸机

| 方式 | 适用 |
|------|------|
| **Docker Compose（推荐）** | Postgres、Redis、Caddy、Portal 镜像；环境可复现；与仓库 `infra/docker-compose*.yml` 一致 |
| **裸机 / systemd** | R Bioconductor、ascp、注释缓存：装在宿主机或专用 worker 镜像（R 镜像体积大，需缓存层） |
| **混合** | Compose 管数据面；`rnaseq-pipeline` / `ncbi-upload` CLI 由宿主机 Python3.11 venv + 系统 R 调用（当前开发机模式） |

轻量云注意：**磁盘要预留 Docker 镜像与 build 缓存**；注释目录挂卷，例如 `/data/keyantong/annotations` → 容器内 `services/rnaseq-pipeline/annotations`。

## 4. Zeabur 与国内轻量云怎么拆

```text
[用户浏览器]
    │
    ├─ HTTPS → Zeabur：apps/portal (+ admin)     ← 发版快、无需备案节点也可先试用
    │
    └─ HTTPS → 国内轻量云：
           Caddy/Nginx
           Postgres + Redis
           文件型 Job 目录 /data/jobs
           R + Python rnaseq-pipeline
           可选 ascp（人工合规安装）
           （可选）NodeBB
```

- 跨云连库：务必 SSL + IP 白名单；MVP 更建议 **DB 与 Job 同国内机**。  
- 备案域名主站必须落国内节点时：Portal 也可整体迁回轻量云，Zeabur 仅作 Preview。

## 5. 容量与成本意识（实操）

1. **先买 2C8G 轻量包年**，跑通 1 路 Job + 监控内存；不够再升 4C16G，比一上来多机复杂。  
2. **限制并发**比盲目加内存更有效；大矩阵（>3 万基因 × >50 样本）单独排队。  
3. **不要**在 2C4G 上同时开：NodeBB + RAG + DESeq2 + ascp。  
4. 注释用 `scripts/fetch_annotations.sh` 在数据盘生成，勿打进 Git/镜像层。  
5. ascp：按 IBM 条款在宿主机手工安装；密钥仅路径；大文件优先对象存储生命周期。  
6. 监控：磁盘 Job 目录、内存、5 分钟 load；OOM 时优先降并发，而非只加 swap。

## 6. 验收清单（上云前）

- [ ] `services/rnaseq-pipeline/.venv` 或镜像内已装依赖；`engine_probe` 见 limma /（可选）pydeseq2  
- [ ] `annotations/human|mouse` 已拉取或挂卷  
- [ ] Job 目录在数据盘；软并发 = 规格表中的值  
- [ ] Postgres 备份策略；对象存储桶分离 `uploads` / `analysis`  
- [ ] ascp 若需要：已手工安装且 `ASCP_BIN` 可解析  

