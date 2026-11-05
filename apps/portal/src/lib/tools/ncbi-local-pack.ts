import type { NcbiPayload } from "./ncbi-validate";
import { validateNcbiPayload } from "./ncbi-validate";

/** Max JSON body for NCBI assist APIs (metadata only — never FASTQ). */
export const NCBI_MAX_JSON_BYTES = 256_000;

export function assertNcbiJsonRequest(request: Request): Response | null {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (
    ct.includes("multipart/form-data") ||
    ct.includes("application/octet-stream")
  ) {
    return new Response(
      JSON.stringify({
        error:
          "禁止上传测序文件到科研通。请只提交 JSON 元数据；大数据请在本机用 ascp 直连 NCBI。",
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
  const ascp = { ...(payload.ascp || {}) } as NcbiPayload["ascp"] &
    Record<string, unknown>;
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

/** Portable Python fallback; the native workflow adds durable manifests and approvals. */
export function buildPortablePythonHelper(
  payload: NcbiPayload,
  mode: "dry-run" | "run",
): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64",
  );
  return [
    "#!/usr/bin/env python3",
    "import base64, json, os, pathlib, shutil, subprocess",
    `payload = json.loads(base64.b64decode("${encoded}"))`,
    "a = payload['ascp']; root = pathlib.Path(a['local_folder']).resolve(strict=True); key = pathlib.Path(a['key_path']).resolve(strict=True)",
    "names = [f['filename'] for f in payload['files']]",
    "if not (root.is_dir() and key.is_file() and not key.is_relative_to(root)): raise SystemExit('Key must be outside the upload directory')",
    "if not (len(names) == len(set(names)) and set(names) == {p.name for p in root.iterdir()}): raise SystemExit('Use a dedicated directory with exactly the listed files')",
    "if not all(pathlib.Path(n).name == n and not (root/n).is_symlink() and (root/n).is_file() and (root/n).stat().st_size > 0 for n in names): raise SystemExit('Invalid data file')",
    "candidates = [pathlib.Path.home()/'Applications/Aspera Connect.app/Contents/Resources/ascp', pathlib.Path('/Applications/Aspera Connect.app/Contents/Resources/ascp'), pathlib.Path('/Applications/Aspera/Connect.app/Contents/Resources/ascp'), pathlib.Path.home()/'.aspera/connect/bin/ascp', pathlib.Path(os.environ.get('LOCALAPPDATA', str(pathlib.Path.home())))/'Programs/IBM/Aspera Connect/bin/ascp.exe']",
    "binary = shutil.which('ascp') or next((str(p) for p in candidates if p.is_file()), None)",
    `dry = ${mode === "run" ? "False" : "True"}`,
    "if dry: print('Local file/path preflight passed. No upload was performed.'); raise SystemExit(0)",
    "if not binary: raise SystemExit('ascp not found. Install from https://www.ibm.com/products/aspera/downloads')",
    "print('Destination: subasp@upload.ncbi.nlm.nih.gov:uploads/' + a['account_folder'] + '/' + root.name)",
    "print('Files:', ', '.join(names))",
    "if input('Type UPLOAD to send these files to NCBI: ') != 'UPLOAD': raise SystemExit('Cancelled')",
    "argv = [binary, '-i', str(key), '-QT', '-l' + a.get('rate', '100m'), '-k1', '-d', str(root), 'subasp@upload.ncbi.nlm.nih.gov:uploads/' + a['account_folder']]",
    "raise SystemExit(subprocess.run(argv, shell=False).returncode)",
    "",
  ].join("\n");
}
export function buildLocalHelperScript(opts: {
  payload: NcbiPayload;
  ascpCommand: string;
  mode: "dry-run" | "run";
}): string {
  return (
    "#!/usr/bin/env bash\n# keyantong-ncbi-local-upload: 科研通本机助手\nset -euo pipefail\ncommand -v python3 >/dev/null || { echo 'Python 3.11+ required' >&2; exit 1; }\npython3 - <<'KEYANTONG_PYTHON'\n" +
    buildPortablePythonHelper(opts.payload, opts.mode) +
    "KEYANTONG_PYTHON\n"
  );
}

export function buildLocalPack(
  payloadIn: NcbiPayload,
  mode: "dry-run" | "run" = "dry-run",
) {
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
    helper_python: validation.ok
      ? buildPortablePythonHelper(payload, mode)
      : null,
    how_to_run: [
      "1. 复制 ascp 命令，或下载本地助手脚本（.sh）与 payload JSON",
      "2. 在存有 FASTQ 与 Aspera 私钥的电脑上执行（chmod +x 后运行）",
      "3. 数据经 ascp 直连 NCBI；科研通不接收、不中转测序文件",
      "4. 使用本机浏览器助手代填已支持字段，在 NCBI 核对文件、公开日期与元数据后提交",
    ],
    install_ascp: {
      url: "https://www.ibm.com/aspera/connect/",
      note: "本机助手可检测和下载官方安装包；许可与系统确认由用户完成，仓库不捆绑 IBM 二进制",
    },
  };
}
