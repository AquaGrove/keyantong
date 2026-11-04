import type { NcbiPayload } from "./ncbi-validate";
import { validateNcbiPayload } from "./ncbi-validate";

/** Max JSON body for NCBI assist APIs (metadata only — never FASTQ). */
export const NCBI_MAX_JSON_BYTES = 256_000;

export function assertNcbiJsonRequest(request: Request): Response | null {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("multipart/form-data") || ct.includes("application/octet-stream")) {
    return new Response(
      JSON.stringify({
        error: "禁止上传测序文件到科研通。请只提交 JSON 元数据；大数据请在本机用 ascp 直连 NCBI。",
        code: "NO_FILE_UPLOAD",
      }),
      { status: 415, headers: { "Content-Type": "application/json" } },
    );
  }
  const cl = request.headers.get("content-length");
  if (cl && Number(cl) > NCBI_MAX_JSON_BYTES) {
    return new Response(
      JSON.stringify({
        error: `请求体过大（>${NCBI_MAX_JSON_BYTES} 字节）。本接口仅接受元数据 JSON，不接受测序文件。`,
        code: "PAYLOAD_TOO_LARGE",
      }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

export function stripSecrets(payload: NcbiPayload): NcbiPayload {
  const ascp = { ...(payload.ascp || {}) } as NcbiPayload["ascp"] & Record<string, unknown>;
  delete (ascp as Record<string, unknown>).key_content;
  delete (ascp as Record<string, unknown>).private_key;
  delete (ascp as Record<string, unknown>).key;
  return {
    bioproject: payload.bioproject,
    biosample: payload.biosample,
    library: payload.library,
    files: payload.files,
    ascp: {
      key_path: String(ascp.key_path || ""),
      local_folder: String(ascp.local_folder || ""),
      ncbi_user_email: String(ascp.ncbi_user_email || ""),
      account_folder: String(ascp.account_folder || ""),
      rate: ascp.rate,
    },
  };
}

function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Shell helper: runs ONLY on the researcher's machine. */
export function buildLocalHelperScript(opts: {
  payload: NcbiPayload;
  ascpCommand: string;
  mode: "dry-run" | "run";
}): string {
  const payloadJson = JSON.stringify(opts.payload, null, 2);
  const quotedCmd = shellSingleQuote(opts.ascpCommand);
  const runFlag = opts.mode === "run" ? "--run" : "--dry-run";
  const isDry = opts.mode !== "run";

  const lines = [
    "#!/usr/bin/env bash",
    "# keyantong-ncbi-local-upload.sh",
    "# 科研通 · NCBI 本地上传助手（必须在你自己的电脑执行）",
    "# 测序文件与私钥内容永不经过科研通服务器；ascp 直连 NCBI。",
    "set -euo pipefail",
    "",
    'ROOT="$(cd "$(dirname "$0")" && pwd)"',
    'PAYLOAD="$ROOT/ncbi-payload.json"',
    'OUTDIR="$ROOT/ncbi_local_out"',
    'mkdir -p "$OUTDIR"',
    "",
    "cat > \"$PAYLOAD\" <<'KEYANTONG_NCBI_PAYLOAD_EOF'",
    payloadJson,
    "KEYANTONG_NCBI_PAYLOAD_EOF",
    "",
    'echo "== 科研通本地助手 =="',
    'echo "payload: $PAYLOAD"',
    'echo "outdir:  $OUTDIR"',
    `echo "mode:    ${opts.mode}"`,
    "echo",
    'echo "建议 ascp 命令："',
    `echo ${quotedCmd}`,
    "echo",
    'if command -v python3 >/dev/null 2>&1; then',
    '  CANDIDATES=(',
    '    "${NCBI_UPLOAD_ROOT:-}"',
    '    "$ROOT/../../../services/ncbi-upload"',
    '    "$ROOT/services/ncbi-upload"',
    '  )',
    '  RUNNER=""',
    '  for c in "${CANDIDATES[@]}"; do',
    '    [ -z "$c" ] && continue',
    '    if [ -d "$c/keyantong_ncbi" ]; then RUNNER="$c"; break; fi',
    "  done",
    '  if [ -n "$RUNNER" ]; then',
    '    echo "使用 Python CLI: $RUNNER"',
    '    export PYTHONPATH="$RUNNER${PYTHONPATH:+:$PYTHONPATH}"',
    `    python3 -m keyantong_ncbi --payload "$PAYLOAD" --outdir "$OUTDIR" ${runFlag}`,
    "    exit $?",
    "  fi",
    "fi",
    "",
    'echo "未找到 keyantong_ncbi；回退到系统 ascp（需已安装 Aspera Connect）。"',
  ];

  if (isDry) {
    lines.push(
      'echo "[dry-run] 不实际上传。确认密钥与数据目录后，用真实上传模式重新下载助手或手动执行 ascp。"',
      "exit 0",
    );
  } else {
    lines.push(
      'if ! command -v ascp >/dev/null 2>&1; then',
      '  echo "错误：未找到 ascp。请安装: https://www.ibm.com/aspera/connect/" >&2',
      "  exit 127",
      "fi",
      `eval ${quotedCmd}`,
    );
  }

  return lines.join("\n") + "\n";
}

export function buildLocalPack(payloadIn: NcbiPayload, mode: "dry-run" | "run" = "dry-run") {
  const payload = stripSecrets(payloadIn);
  const validation = validateNcbiPayload(payload);
  const ascpCommand = validation.ascp_command;
  const helper_script =
    validation.ok && ascpCommand
      ? buildLocalHelperScript({ payload, ascpCommand, mode })
      : null;
  return {
    architecture: "local_only" as const,
    data_plane: "user_machine_to_ncbi" as const,
    portal_role: "metadata_validate_and_command_pack" as const,
    never_upload_fastq_to_portal: true,
    server_executes_ascp: false,
    mode,
    ok: validation.ok,
    issues: validation.issues,
    ascp_command: ascpCommand,
    checklist: validation.checklist,
    portal_checklist: validation.portal_checklist,
    payload,
    helper_script,
    how_to_run: [
      "1. 复制 ascp 命令，或下载本地助手脚本（.sh）与 payload JSON",
      "2. 在存有 FASTQ 与 Aspera 私钥的电脑上执行（chmod +x 后运行）",
      "3. 数据经 ascp 直连 NCBI；科研通不接收、不中转测序文件",
      "4. 再到 NCBI Submission Portal 完成网页人工步骤（本站不做浏览器代填）",
    ],
    install_ascp: {
      url: "https://www.ibm.com/aspera/connect/",
      note: "IBM 许可需用户本机自行安装；仓库不捆绑 ascp",
    },
  };
}
