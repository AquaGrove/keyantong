# NCBI 数据上传协助

校验 → ascp 命令 → 本机 dry-run/执行（异步 Job 轮询）。密钥仅路径。

**Submission Portal 网页代填 / 自动提交不在范围内。** 使用 `portal_checklist` 跟踪人工步骤（`automation_policy=no_browser_automation`）。

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -v
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --dry-run
```

## Portal checklist (no browser automation)

`keyantong_ncbi.portal_checklist` tracks validate → dry-run → optional ascp → manual Submission Portal steps.
The portal UI mirrors this state machine. We do **not** automate NCBI Submission Portal in the browser.

## Aspera / ascp（本机安装说明）

NCBI SRA 大文件上传通常使用 **IBM Aspera Connect / ascp**。本工具只：

1. 校验元数据与文件清单；
2. 生成 `ascp` 命令（密钥路径由用户本机提供，**不落库**）；
3. 可选在本机执行 dry-run 或真 ascp（需已安装 CLI）。

### 是否已安装

```bash
command -v ascp || ls "$HOME/Applications/Aspera Connect.app/Contents/Resources/ascp" 2>/dev/null
```

本机（2026-11-04 检查）若 `ascp not found`，需手动安装，**不在此仓库自动安装**（IBM 许可与安装器需用户同意）。

### 官方下载（需人工同意条款）

| 资源 | URL |
|------|-----|
| IBM Aspera Connect（含 GUI/ascp） | https://www.ibm.com/aspera/connect/ |
| NCBI SRA 提交 / Aspera 说明 | https://www.ncbi.nlm.nih.gov/sra/docs/submit/ |
| NCBI 常用 ascp 目标主机说明 | 见 Submission 指引中的 `upload.ncbi.nlm.nih.gov` 等 |

macOS：安装 Connect 后二进制常在  
`~/Applications/Aspera Connect.app/Contents/Resources/ascp`。  
Linux：按 IBM 文档解压 Connect/CLI，将 `ascp` 加入 `PATH`，并准备 NCBI 提供的 SSH 私钥路径。

环境变量（可选）：

- `ASCP_BIN`：ascp 绝对路径  
- 门户/CLI payload 中的 `ascp_key_path`：仅本机私钥路径

**许可注意：** Aspera Connect 的再分发与无人值守安装受 IBM 条款约束；CI/服务器镜像请自行合规安装，本仓库只文档化 URL，不捆绑安装包。
