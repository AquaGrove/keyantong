> 2026-11-05：本机浏览器自动化边界已按用户新要求由 ADR-011 扩展。数据仍本机直传；现行开发预览与验收见 [29](./29-ncbi-automation.md)。

# 19 · NCBI 上传：本机直连架构

**状态：** Accepted  
**版本：** v0.1  
**更新：** 2026-11-04（Asia/Shanghai）  
**相关：** [15 · RNAseq/NCBI 工具](./15-rnaseq-ncbi-tools.md) · [18 · 安全基线](./18-security-baseline.md)

## 1. 产品原则（硬约束）

> 网站效果 = 给大家一个**入口**，在**用户本地**自动完成上传。  
> **所有测序大数据不得经过科研通服务器**（资源不够，也不该碰用户原始数据）。

| 平面 | 谁做 | 做什么 |
|------|------|--------|
| 控制面（门户） | 科研通 | 引导、元数据表单、字段/文件名校验、生成 ascp 命令与本地助手脚本、状态说明 / checklist |
| 数据面 | 用户电脑 → NCBI | ascp（Aspera）直连；FASTQ/BAM 等只在用户盘与 NCBI 之间流动 |
| 密钥 | 用户本机 | 只填**绝对路径**；内容不落库、不进日志、不上传 |

**禁止：** 把测序文件上传到科研通再转发 NCBI；服务器端代跑 ascp 读用户路径（云端部署下既错误又危险）。

## 2. 威胁与边界

| 风险 | 缓解 |
|------|------|
| 大文件打爆门户磁盘/带宽 | API 拒绝 multipart/octet-stream；JSON 体硬上限（256KB） |
| 私钥泄漏 | 拒绝 `key_content` 字段；只存路径字符串于生成的本地脚本 |
| 门户被当成上传中继 | `ncbi-run` 只返回 local pack；`execute_on_server` → 403；`enqueueNcbiJob` 默认禁用 |
| 浏览器自动化登录 NCBI | **明确不做**；checklist 仅跟踪人工网页步骤 |
| 本机助手被误当成远程执行 | UI/文档反复强调「在你自己的电脑执行」 |

可选（默认关闭）：用户本机另起 localhost 小服务回报进度给门户——需 CSRF/绑定令牌；**当前 MVP 不实现**，进度靠用户勾选 checklist。

## 3. 当前实现

- UI：`/tools/ncbi-upload` — 文案与按钮改为「生成本地助手包 / 复制命令 / 下载 .sh」
- `POST /api/tools/ncbi-validate` — 仅元数据；带 `architecture: local_only`
- `POST /api/tools/ncbi-run` — **不再** spawn 服务器 ascp；返回 `helper_script` + `ascp_command` + `payload`
- `services/ncbi-upload` CLI — 仍供**用户本机** `python -m keyantong_ncbi --run` 使用

## 4. 用户本机跑通

1. 门户登录（校园试用/会员）→ 填写 BioProject/Sample/文库与文件名、本机路径  
2. 校验通过 →「生成本机上传包」→ 下载 `keyantong-ncbi-local-upload.sh`（或复制 ascp）  
3. 本机安装 [IBM Aspera Connect](https://www.ibm.com/aspera/connect/)（许可需自装）  
4. `chmod +x keyantong-ncbi-local-upload.sh && ./keyantong-ncbi-local-upload.sh`  
5. 再到 NCBI Submission Portal 完成网页提交（人工）

```bash
# 可选：克隆仓库后用 Python CLI（同样只在本机）
cd services/ncbi-upload
PYTHONPATH=. python3 -m keyantong_ncbi --payload /path/to/ncbi-payload.json --outdir /tmp/ncbi-out --dry-run
PYTHONPATH=. python3 -m keyantong_ncbi --payload /path/to/ncbi-payload.json --outdir /tmp/ncbi-out --run
```

## 5. 剩余项

- ascp / Aspera Connect：**用户自装**（IBM 许可，仓库不捆绑）  
- Submission Portal 网页步骤：人工  
- 本机进度自动回传门户：未做  
- 多文件 MD5 清单生成器：可后续加在本地助手里  
