export type NcbiIssue = { level: "error" | "warning"; field: string; message: string };

export type NcbiPayload = {
  bioproject: Record<string, string>;
  biosample: Record<string, string>;
  library: Record<string, string>;
  files: { filename: string }[];
  ascp: {
    key_path: string;
    local_folder: string;
    ncbi_user_email: string;
    account_folder: string;
    rate?: string;
  };
};

const REQUIRED_BIOPROJECT = ["title", "description", "data_type"] as const;
const REQUIRED_BIOSAMPLE = ["sample_name", "organism", "isolate_or_breed", "collection_date"] as const;
const REQUIRED_LIBRARY = ["library_strategy", "library_source", "library_selection", "library_layout"] as const;

const FASTQ_RE = /^.+\.(fastq|fq)(\.gz)?$/i;
const PAIR_RE = /([_\.-])(R?[12]|R?[12]_001)([_\.-]|\.)/i;

function missing(obj: Record<string, string>, keys: readonly string[], prefix: string): NcbiIssue[] {
  const out: NcbiIssue[] = [];
  for (const k of keys) {
    if (!String(obj?.[k] || "").trim()) {
      out.push({ level: "error", field: `${prefix}.${k}`, message: `缺少必填项：${k}` });
    }
  }
  return out;
}

export function buildAscpCommand(ascp: NcbiPayload["ascp"]): { command: string | null; issues: NcbiIssue[] } {
  const issues: NcbiIssue[] = [];
  const key = (ascp.key_path || "").trim();
  const folder = (ascp.local_folder || "").trim();
  const email = (ascp.ncbi_user_email || "").trim();
  const account = (ascp.account_folder || "").trim();
  const rate = (ascp.rate || "100m").trim() || "100m";
  if (!key) issues.push({ level: "error", field: "ascp.key_path", message: "需要本机 Aspera 私钥绝对路径（不会上传到服务器）" });
  else if (!key.startsWith("/")) issues.push({ level: "error", field: "ascp.key_path", message: "密钥路径必须是绝对路径" });
  if (!folder) issues.push({ level: "error", field: "ascp.local_folder", message: "需要本地待上传文件夹路径" });
  if (!email.includes("@")) issues.push({ level: "error", field: "ascp.ncbi_user_email", message: "需要 NCBI 账户邮箱（ascp 目标用户）" });
  if (!account) issues.push({ level: "error", field: "ascp.account_folder", message: "需要 NCBI 分配的 uploads 子目录名" });
  if (issues.length) return { command: null, issues };
  return {
    command: `ascp -i ${key} -QT -l${rate} -k1 -d ${folder} ${email}:uploads/${account}`,
    issues: [],
  };
}

export function validateNcbiPayload(payload: NcbiPayload) {
  const issues: NcbiIssue[] = [];
  issues.push(...missing(payload.bioproject || {}, REQUIRED_BIOPROJECT, "bioproject"));
  issues.push(...missing(payload.biosample || {}, REQUIRED_BIOSAMPLE, "biosample"));
  issues.push(...missing(payload.library || {}, REQUIRED_LIBRARY, "library"));
  const files = payload.files || [];
  if (!files.length) issues.push({ level: "error", field: "files", message: "至少提供一个数据文件名" });
  const names = files.map((f) => (f.filename || "").trim()).filter(Boolean);
  if (names.length !== files.length) {
    issues.push({ level: "error", field: "files", message: "存在空文件名" });
  }
  for (const n of names) {
    if (!FASTQ_RE.test(n) && !/\.(bam|cram|hdf5|fast5)$/i.test(n)) {
      issues.push({ level: "warning", field: "files", message: `扩展名非常见测序格式：${n}` });
    }
  }
  const layout = String(payload.library?.library_layout || "paired").toLowerCase();
  if (layout === "paired" && names.length % 2 !== 0) {
    issues.push({ level: "error", field: "files", message: "paired 布局下文件数应为偶数" });
  }
  if (layout === "paired") {
    for (const n of names) {
      if (!PAIR_RE.test(n)) {
        issues.push({ level: "warning", field: "files", message: `无法从文件名识别 R1/R2 配对标记：${n}` });
      }
    }
  }
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) issues.push({ level: "error", field: "files", message: `重复文件名：${n}` });
    seen.add(n);
  }
  const { command, issues: ascpIssues } = buildAscpCommand(payload.ascp || ({} as NcbiPayload["ascp"]));
  issues.push(...ascpIssues);
  const ok = !issues.some((i) => i.level === "error");
  return {
    ok,
    issues,
    ascp_command: ok ? command : null,
    checklist: [
      "在 NCBI Submission Portal 创建/选择 BioProject",
      "按校验后的字段填写 BioSample 属性",
      "上传 SRA metadata 表（文件名与本地一致）",
      "本机安装 IBM Aspera Connect / ascp",
      "使用生成的 ascp 命令上传（私钥仅留在本机）",
      "在 Portal 核对 MD5 / 文件清单后提交",
    ],
  };
}
