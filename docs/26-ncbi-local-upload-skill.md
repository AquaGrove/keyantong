# NCBI 全自动上传 Skill · 仓库侧草稿 Checklist

> **状态：** Skill 正文草案（已写入仓库；父代理请 UpdateSkill）\n> **代码修复：** ascp 远程用户已改为 `subasp@upload.ncbi.nlm.nih.gov`（2026-11-05）  
> **产出时间：** 2026-11-05（Asia/Shanghai）  
> **仓库：** `/Users/nature/Desktop/科研通` · 分支 `feat/rnaseq-ncbi-oneclick`  
> **说明：** 本文仅整理现有代码/文档事实与缺口，**不**调用 UpdateSkill；密钥/私钥内容一律不写入。  
> **依据：** `docs/15` · `docs/19` · `services/ncbi-upload` · `apps/portal` NCBI 页/API · `_ncbi_upload_slides_extract.txt`（pptx 提取）

---

## 0. 用户期望 vs 当前仓库口径（先对齐）

| 维度 | 用户期望（本轮对话） | 仓库当前硬约束（docs/15、19） |
|------|----------------------|-------------------------------|
| 入口 | 门户填信息后尽量自动走完 | 门户只做控制面：校验 + 生成命令/助手包 |
| 数据面 | 本机自动装 ascp + 用密钥与原始数据上传 | **大数据永不经科研通服务器**；用户本机 ascp → NCBI |
| 网页侧 | 用账号/API key 进入 NCBI，逐步完成提交 | **Submission Portal 浏览器代填 = 明确不做**（checklist 仅跟踪人工） |
| 服务器 ascp | 不要占服务器带宽 | 已禁用；`execute_on_server` → 403；`enqueueNcbiJob` 默认失败 |

**Skill 定稿建议：** 做成「用户本机编排器」（桌面助手 / 本地 CLI / 可选本机 agent），门户仍只发元数据与包；网页步骤若要自动化，必须**跑在用户本机浏览器会话**，不得把 NCBI 密码/私钥交回服务器。实操报告回来后再决定：A) 严格本地 ascp 全自动 + 网页 checklist；B) 本机驱动 Portal（Playwright 等）——需改 `automation_policy` 与安全文档。

---

## 1. 本机直传架构边界（必须写进 Skill）

### 1.1 三平面

| 平面 | 谁 | 做什么 | 禁止 |
|------|----|--------|------|
| 控制面 | 科研通门户 | 元数据表单、字段/文件名校验、生成 ascp 命令与 `.sh` 助手、进度 checklist | 收 multipart/FASTQ；存 `key_content`；服务器 spawn ascp |
| 数据面 | 用户电脑 → NCBI | ascp（Aspera）直连；FASTQ/BAM 只在用户盘与 NCBI 之间 | 经科研通中转 |
| 密钥 | 用户本机 | 只填**绝对路径**；内容不落库、不进日志、不上传 | 粘贴私钥正文到网页 |

### 1.2 代码锚点

- `docs/19-ncbi-local-upload-architecture.md` — Accepted
- `apps/portal/src/lib/tools/ncbi-local-pack.ts` — `architecture: local_only`；`NCBI_MAX_JSON_BYTES = 256000`；拒 multipart/octet-stream
- `apps/portal/src/app/api/tools/ncbi-run/route.ts` — 只返回 pack；`execute_on_server` → 403 `SERVER_ASCP_DISABLED`
- `apps/portal/src/lib/tools/ncbi-jobs.ts` — `enqueueNcbiJob` 标注 deprecated；除非 `NCBI_ALLOW_SERVER_ASCP=1` 否则直接 fail
- `services/ncbi-upload/keyantong_ncbi/runner.py` — 本机 dry-run/run；只检查密钥路径存在与权限，**不读密钥内容**

### 1.3 Skill 必须复述的用户话术

1. 测序文件不经过科研通。  
2. Aspera 私钥只留本机路径。  
3. 真正上传在用户电脑执行。  
4. Portal 网页步骤当前需人工（或未来本机自动化，仍不经服务器）。

---

## 2. 现有命令 / 脚本生成能力（已有，可复用）

### 2.1 门户 API

| 接口 | 作用 | 返回要点 |
|------|------|----------|
| `POST /api/tools/ncbi-validate` | 仅元数据校验 | `ok` / `issues` / `ascp_command` / `portal_checklist` / `architecture: local_only` |
| `POST /api/tools/ncbi-run` | 生成本地助手包 | `helper_script` · `ascp_command` · `payload` · `how_to_run` · `install_ascp` · `mode: dry-run\|run` |
| `GET /api/tools/ncbi-run?id=` | 历史任务只读 | 新流程不再入队服务器 ascp |

### 2.2 本机 CLI（`services/ncbi-upload`）

```bash
cd services/ncbi-upload
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --dry-run
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --run
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --validate-only
# 可选：--ascp-bin /path/to/ascp
```

能力：`validate_submission` → `build_ascp_command` → `prepare_and_run`（路径/文件存在性、权限警告、进度日志 `ascp_progress.log`、`status.json`、checklist）。

### 2.3 助手脚本 `keyantong-ncbi-local-upload.sh`（门户生成）

- 内嵌 `ncbi-payload.json`（已 `stripSecrets`）
- 优先找 `keyantong_ncbi`（`NCBI_UPLOAD_ROOT` / 相对仓库路径）
- 找不到则回退系统 `ascp`；dry-run 模式不实际上传
- **缺口：** 无 Windows `.ps1`/`.bat`；无「自动下载安装 Aspera」；未嵌入仓库时用户需另备 CLI 或系统 ascp

### 2.4 校验覆盖（已有）

- BioProject：`title` / `description` / `data_type`
- BioSample：`sample_name` / `organism` / `isolate_or_breed` / `collection_date`
- 文库：strategy / source / selection / layout（门户已有下拉词表 `ncbi-vocab`）
- 文件：非空、去重；paired 偶数；R1/R2 软警告；扩展名警告
- ascp 字段：`key_path`（须绝对路径）/ `local_folder` / `ncbi_user_email` / `account_folder` / 可选 `rate`

### 2.5 Checklist 状态机（已有，无浏览器驱动）

`validate` → `dry_run` → `ascp_upload` → `portal_login` → `bioproject` → `biosample` → `sra_submit` → `accessions`  
`automation_policy: no_browser_automation`

---

## 3. Aspera 安装与密钥路径约定（现有）

### 3.1 探测路径（`runner.find_ascp`）

1. 显式 `--ascp-bin` / 入参  
2. `PATH` 中的 `ascp`  
3. 候选：  
   - `$HOME/Applications/Aspera Connect.app/Contents/Resources/ascp`（macOS 用户目录）  
   - `/Applications/Aspera Connect.app/Contents/Resources/ascp`  
   - `/usr/local/bin/ascp` · `/usr/bin/ascp`  
4. **未覆盖：** Windows `C:\Users\<user>\AppData\Local\Programs\IBM\Aspera Connect\bin\ascp.exe`（pptx/slides 有写）

### 3.2 安装政策

- 文档/助手：用户自装 [IBM Aspera Connect](https://www.ibm.com/aspera/connect/)  
- **仓库不捆绑** ascp（IBM 许可）  
- 门户 UI 只给安装链接 note，**无自动安装脚本**

### 3.3 密钥约定（安全红线）

| 项 | 约定 |
|----|------|
| 表单字段 | `ascp.key_path` = 本机绝对路径字符串 |
| 禁止字段 | `key_content` / `private_key` / `key`（API 拒绝或 strip） |
| 运行时 | 只 `stat` 存在性 + 权限；`mode & 0o077` → warning，建议 `chmod 600` |
| 日志 | 不展开密钥内容；stdout 遇 `PRIVATE KEY` / `BEGIN OPENSSH` 则 redact |
| 来源（slides） | Submission Portal「Files → FTP/Aspera preload」页提供 **Download the key file**（如 `aspera.openssh`）；勿公开分享 |

### 3.4 远程目标（slides 真值 vs 代码现状）⚠️

**幻灯片 / NCBI 说明中的标准命令形态：**

```text
ascp -i <绝对路径/aspera.openssh> -QT -l100m -k1 -d <本地含文件目录> \
  subasp@upload.ncbi.nlm.nih.gov:uploads/<account_folder>
```

要点：

- 远程用户固定为 **`subasp@upload.ncbi.nlm.nih.gov`**，不是登录邮箱  
- `account_folder` 形如 `2366117804_qq.com_xxxx`（Portal 分配的 preload 子目录）  
- `-d`：在 preload 区创建目录；文件须进**子目录**，勿只传到 account-level（否则进 `moved_by_ncbi`，约 30 天删）  
- 上传后约 **≥10 分钟** 才能在 Files 步选中；文件夹创建后约 **30 天内**须完成提交  

**当前 `buildAscpCommand` / `validators.build_ascp_command`：**

```text
ascp -i {key_path} -QT -l{rate} -k1 -d {local_folder} {ncbi_user_email}:uploads/{account_folder}
```

→ 把「NCBI 账户邮箱」误当成 ascp 远程用户。Skill/修复应改为：邮箱仅作账号标识/展示；命令远程端固定 `subasp@upload.ncbi.nlm.nih.gov`。

### 3.5 Windows 路径校验缺口

门户 `ncbi-validate.ts`：`key.startsWith("/")` 才算绝对路径 → **Windows `C:\...` 会被判错**。Skill/修复需同时接受 POSIX 与 Win 盘符/UNC。

---

## 4. 门户第 3 步「Aspera」字段与缺口

### 4.1 UI 第 3 步现有字段（`ncbi-upload-assist.tsx`）

| 字段 | 用途 | 备注 |
|------|------|------|
| 本机私钥绝对路径 | `key_path` | placeholder macOS 风格；无文件选择器（浏览器安全限制） |
| 本地待上传文件夹 | `local_folder` | 须含清单中全部文件名 |
| NCBI 账户邮箱 | `ncbi_user_email` | 文案写成「ascp 用户」——与真实 ascp 用户不一致（见 §3.4） |
| uploads 子目录名 | `account_folder` | 须从 Portal preload 说明复制；**填表时尚可能拿不到**（鸡生蛋） |

说明：私钥内容禁止粘贴；服务器不读路径下文件。

### 4.2 已有（第 4 步）

- 校验问题列表  
- 生成本地 dry-run 包 / 实际上传包  
- 复制 ascp 命令、下载 `.sh`、下载 `payload.json`  
- 手动勾选 Portal 步骤 checklist  

### 4.3 明确缺口（相对「全自动」Skill）

| # | 缺口 | 影响 | Skill / 产品建议 |
|---|------|------|------------------|
| G1 | **不自动安装 ascp** | 用户卡在「未找到 ascp」 | 本机脚本：按 OS 打开官方下载页 + 探测常见路径 + 失败给出安装指引；**不**静默绕过 IBM 许可捆绑 |
| G2 | **不驱动 Submission Portal 网页** | BioProject/BioSample/SRA/选 preload 仍靠人手 | 实操后二选一：保持 checklist；或本机浏览器自动化（密钥不出本机） |
| G3 | ~~ascp 远程用户写错~~（已修） | 曾用邮箱当远程用户 | **已修**：固定 `subasp@upload.ncbi.nlm.nih.gov`；邮箱仅备忘 |
| G4 | **account_folder / key 来自 Portal 中后段** | 第 3 步可能空填 | Skill 流程改为：先 Portal 走到 Files preload → 下载 key、复制 folder → 再跑 ascp；或「两段式」表单 |
| G5 | **无自动下载 key 文件** | 用户手存 `aspera.openssh` | 本机助手在用户已登录会话中拉取，或明确「请先下载到某路径」 |
| G6 | **无 Windows 助手** | 用户截图环境是 Win 路径 | 生成 `.ps1` / `cmd`；`find_ascp` 加 Win 候选 |
| G7 | **无 MD5 / 文件清单生成器** | docs/19 剩余项 | 本机扫 `local_folder` 生成与 SRA metadata 对齐的清单 |
| G8 | **无进度回传门户** | 默认靠勾选 | docs 写明可选 localhost 回报（CSRF 令牌）；MVP 可不做 |
| G9 | **绝对路径校验偏 Unix** | Win 用户第 3 步过不了校验 | 修 `buildAscpCommand` |
| G10 | **助手依赖仓库 CLI** | 仅下载 `.sh` 的用户常走系统 ascp 分支 | 发布独立 pip/zip 本机工具，或把最小 runner 打进下载包 |
| G11 | **SRA metadata / BioSample Excel 未自动生成** | slides 显示需上传 Plant.xlsx、SRA.metadata | Skill：由门户字段导出 TSV/XLSX 模板填充 |
| G12 | **API key 角色不清** | 用户提到「账号和 API key」 | NCBI 常规 SRA 走网页+ascp；若有其它 API，实操后单独列；**勿把 API key 存服务器明文** |

---

## 5. 幻灯片流程骨架（Skill 步骤草案 · 待实操核对）

来源：`_ncbi_upload_slides_extract.txt` / `ncbi数据上传流程.pptx`

1. 打开 NCBI → Submission Portal → **Submit to SRA**  
2. Submitter（姓名/邮箱；组织邮箱更稳；qq/163 可能收不到信）  
3. General Info：已有/新建 BioProject、BioSample；release 日期  
4. BioSample Type：选 package（如 Plant）  
5. BioSample Attributes：表编辑或上传 Excel/TSV  
6. SRA Metadata：上传 metadata 表（文件名必须与本地一致）  
7. Files：选 **FTP or Aspera Command Line file preload**  
8. 按页内说明：安装 Aspera Connect → **下载 key** → 复制 ascp 命令中的 `uploads/<folder>`  
9. 本机执行 ascp（数据面）  
10. 等待 ≥10 分钟 → 在 Files 选中 preload 文件夹 → Review & Submit  
11. 保存 Accession  

与门户 checklist 步骤可映射；Skill 应逐步确认选择器/文案（等浏览器报告）。

---

## 6. Skill 能力分层（定稿时建议写清）

### L0 — 已具备（控制面）

- [x] 元数据校验 + 文库词表  
- [x] 生成 ascp 命令字符串 + bash 助手  
- [x] 本机 CLI dry-run/run + status/checklist JSON  
- [x] 拒绝服务器收文件 / 拒密钥内容 / 拒服务器 ascp  

### L1 — Skill 应优先补齐（本机，仍不经服务器）

- [ ] 修正远程目标为 `subasp@upload.ncbi.nlm.nih.gov`  
- [ ] Win/macOS/Linux ascp 探测 + 安装引导（非捆绑）  
- [ ] Win 绝对路径与 `.ps1` 助手  
- [ ] 两段式：Portal 拿到 key + account_folder 后再生成最终命令  
- [ ] 本地目录 vs 文件清单对账 + 可选 MD5  
- [ ] 从门户字段生成 BioSample/SRA metadata 草稿表  

### L2 — 「全自动」网页（高风险，等实操 + 产品拍板）

- [ ] 本机登录 NCBI（保险库凭证，不上云）  
- [ ] 逐步点击 Submission Portal（与 slides 一致）  
- [ ] 自动下载 key、解析 preload 路径、触发本机 ascp  
- [ ] 提交后回填 Accession 到门户 checklist / 通知中心  
- [ ] 明确政策变更：从 `no_browser_automation` → `local_browser_automation_only`

### L3 — 明确不做

- [ ] 服务器代持 NCBI 密码或 aspera 私钥  
- [ ] FASTQ 上传到科研通再转发  
- [ ] 仓库内分发 IBM Aspera 安装包二进制  

---

## 7. 安全 Checklist（Skill 必含）

- [ ] 私钥/密码/API key 仅本机或用户保险库；日志 redact  
- [ ] 助手脚本审视为「用户可读、无隐蔽外传」  
- [ ] ascp 命令参数引用绝对路径；目录遍历不跟到无关盘符  
- [ ] 门户继续 256KB JSON 上限与 NO_FILE_UPLOAD  
- [ ] 文档与 UI 同步：邮箱 ≠ ascp 远程用户  
- [ ] 实操账号若用演示数据，勿把真实 key 路径/account_folder 提交进 git  

---

## 8. 定稿前等待项（浏览器实操报告）

- [ ] Portal 2026 界面选择器与步骤是否与 pptx OCR 一致  
- [ ] key 下载按钮与 `account_folder` 展示位置  
- [ ] 是否存在可用的 NCBI API（相对纯网页）及鉴权方式  
- [ ] 国内网络下 ascp 连通性 / 限速经验值  
- [ ] 登录是否强制 2FA（影响本机自动化）  
- [ ] 与用户期望「全自动」最终取 L1 还是 L2  

---

## 9. 关键文件索引（父代理写 Skill 时引用）

| 路径 | 角色 |
|------|------|
| `docs/15-rnaseq-ncbi-tools.md` | 产品诚实边界 |
| `docs/19-ncbi-local-upload-architecture.md` | 本机直传 Accepted |
| `services/ncbi-upload/keyantong_ncbi/validators.py` | 校验 + 命令拼装 |
| `services/ncbi-upload/keyantong_ncbi/runner.py` | 本机 ascp 执行 |
| `services/ncbi-upload/keyantong_ncbi/portal_checklist.py` | checklist 状态机 |
| `apps/portal/src/lib/tools/ncbi-local-pack.ts` | 助手脚本生成 |
| `apps/portal/src/lib/tools/ncbi-validate.ts` | TS 侧校验（含路径规则） |
| `apps/portal/src/components/ncbi-upload-assist.tsx` | 四步向导 UI |
| `apps/portal/src/app/api/tools/ncbi-run/route.ts` | 本地包 API |
| `_ncbi_upload_slides_extract.txt` | 人工流程 OCR |
| `catalog/tools/ncbi-sra-upload.yaml` | 工具目录条目 |

---

## 10. 一句话结论（给父代理）

仓库已具备 **「元数据校验 + 本机 ascp 命令/助手包」** 的控制面；**缺**自动装 ascp、正确的 `subasp@upload...` 命令模板、Windows 路径/脚本、Portal 网页驱动，以及 key/account_folder 的两段式获取。Skill 应定位为 **用户本机编排**，等浏览器实操报告后在 L1（推荐先做）与 L2（全自动网页）之间定稿；**不要**把数据面或密钥搬回服务器。


---

## Skill 正文（供 UpdateSkill）

**Name:** `ncbi-local-upload`  
**When to use:** 用户要做 NCBI SRA/Geo 本机 Aspera 上传、生成 ascp 命令、校验 BioProject/BioSample/Library 元数据、或问密钥/preload 目录怎么填。

### 必须遵守
1. 测序大数据**不经科研通服务器**；门户只做控制面（校验 + 生成本机命令/助手包）。
2. Aspera 私钥只填本机**绝对路径**，禁止上传私钥正文。
3. ascp 远程用户固定为 **`subasp@upload.ncbi.nlm.nih.gov`**，**不是**登录邮箱；`account_folder` 来自 Submission Portal Files → FTP/Aspera preload。
4. 标准命令：
   ```bash
   ascp -i <绝对路径/aspera.openssh> -QT -l100m -k1 -d <本地目录> \
     subasp@upload.ncbi.nlm.nih.gov:uploads/<account_folder>
   ```
5. Portal 网页（BioProject/BioSample/SRA 提交）当前为人工 checklist；若自动化必须跑在**用户本机浏览器**，密钥不出本机。
6. 引导用户：先 Portal 走到 preload → 下载 key、复制 folder → 再在科研通填第 3 步 → 本机执行助手/`ascp`。
7. 不捆绑/不静默安装 IBM Aspera（许可）；只给官方下载链接与常见路径探测。

### 仓库锚点
- `docs/19-ncbi-local-upload-architecture.md`
- `apps/portal`：`/tools/ncbi-upload`、`ncbi-validate` / `ncbi-run`、`ncbi-vocab`
- `services/ncbi-upload`：本机 CLI

完整清单与缺口见本文前半（源自 `ncbi-skill-draft.md`）。
