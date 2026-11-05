# NCBI 数据上传协助（本机执行）

**数据面在用户电脑**：校验元数据 → 生成 ascp 命令 → 本机 dry-run / 执行。  
科研通门户**不接收、不中转**测序文件；详见 `docs/19-ncbi-local-upload-architecture.md`。

密钥仅路径。**Submission Portal 网页代填不做。**

```bash
PYTHONPATH=. python3 -m unittest discover -s tests -v
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --dry-run
PYTHONPATH=. python3 -m keyantong_ncbi --payload payload.json --outdir /tmp/ncbi-out --run
```

## Aspera / ascp

需本机安装 IBM Aspera Connect（[下载](https://www.ibm.com/aspera/connect/)）。仓库不捆绑安装包。

```bash
command -v ascp || ls "$HOME/Applications/Aspera Connect.app/Contents/Resources/ascp" 2>/dev/null
```

## Local automation development preview (2026-11-05)

The Chrome and Edge extension in `extension/` communicates with a native Python host. There is no public localhost HTTP command endpoint, and no NCBI cookies/passwords are copied to the portal. The native host provides OS/ascp detection, current-account key import, official IBM installer discovery, exact file manifests, confirmation-bound transfer tasks and local status.

1. Chrome → `chrome://extensions` → developer mode → Load unpacked → select `services/ncbi-upload/extension`. Note its extension ID.
2. On macOS/Linux (Python ≥3.11), run `python3 scripts/install_native_host.py --extension-id <id>` from this directory. This registers only that extension under the current user's Chrome installation.
3. On Windows, build the reviewed native entry with PyInstaller on Windows (`python -m PyInstaller --onefile --paths . --name keyantong-ncbi-host scripts/native_entry.py`), then register using `python scripts/install_native_host.py --extension-id <id> --windows-exe dist/keyantong-ncbi-host.exe`. A signed public executable is not shipped yet.
   For Microsoft Edge Stable, use `edge://extensions` to load the same unpacked extension, copy its Edge ID and pass `--browser edge` to the install command (on Windows, also pass `--windows-exe`).
4. Click the extension icon. In your logged-in SRA tab expand the Aspera command-line instructions. Read the page, download/import its current key, detect/install ascp, select metadata JSON and a dedicated local data directory.
5. Review filenames, total bytes and target. Explicitly confirm transfer, then start. Progress survives closing the assistant tab; refresh local task status after reopening.
6. Fill the current Portal step using an optional `portal_fields` map (`"exact visible label": "value"`), then review/save on NCBI. Duplicate labels, radios/checkboxes, table uploads and unknown pages are deliberately not auto-filled.

Local task state lives in `~/.keyantong/ncbi/tasks/`, keys in `credentials/`, installer receipts in `installers/`. No real keys or task files belong in this repository. Setting `KEYANTONG_NCBI_HOME` selects a disposable test directory.

The transfer runner requires an upload directory containing **only the manifest's regular files**, with no subfolders/symlinks. It passes an argv array to ascp (`shell=False`), checks source changes, enforces a timeout even if ascp is silent, and keeps transfer completion separate from NCBI submission. The legacy shell helper is for reviewed command generation; use the native workflow for manifest-bound execution.

Installer discovery follows the current IBM page. Windows/macOS open a platform-signed installer for the user to finish. Linux requires local installer review; ARM compatibility needs vendor confirmation. This preview does not bypass a license, MFA, UAC or Gatekeeper prompt. It has not been accepted against a real data submission on every supported OS.

Design, state transitions, evidence and remaining end-to-end work: [docs/29-ncbi-automation.md](../../docs/29-ncbi-automation.md). Reusable agent instructions: [SKILL.md](../../skills/ncbi-local-upload/SKILL.md).


## 在科研通聊天中粘贴分析文件路径

安装或更新上述 Chrome 扩展和本机程序，刷新科研通页面。在聊天中粘贴 CSV、TSV 或 JSON 的本机绝对路径。核对浏览器确认框中的路径，确认后文件加入当前对话的待处理列表。单个文件上限为 80 MB，支持空格和中文路径。文件只读取到当前浏览器，正式提交云端计算仍使用原有的“开始分析”流程。没有安装本机助手时，也可通过输入框旁的「选文件」完成选择。


## 从聊天准备 FASTQ 批量预上传

在科研通说“批量上传转录组数据”，再粘贴专用 FASTQ 目录路径。也可以先把文件夹拖入聊天框，浏览器将提供文件名和大小，传输前仍需补充实际路径。助手检查文件名配对并逐项询问共同信息。“导出上传清单”生成供核对的 TSV 对照表。先通过扩展界面导入 NCBI 分配的 preload 目录和密钥，并配置 ascp。随后在聊天里说“准备上传”，核对预检给出的目标和文件数后说“确认上传”，在浏览器确认启动。“查看上传状态”查询本机传输。最终仍需在 NCBI Submission Portal 核对各 BioSample 与文件的对应关系并完成提交。原始文件始终由本机直传 NCBI。

在 Safari、Firefox 等浏览器，可用聊天框的「选文件」多选 FASTQ 准备清单，随后说“用 NCBI 网页上传”。登录 NCBI 后，少量小文件可走 Files 页的 HTTP；批量数据可按 [NCBI 官方说明](https://www.ncbi.nlm.nih.gov/sra/docs/submitfiles/) 使用本机 Aspera 命令行预上传。网页登录与本机助手的连接是独立的。
