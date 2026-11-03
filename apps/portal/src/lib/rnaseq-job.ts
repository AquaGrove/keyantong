import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dataDir } from "./user-store";

export const RNASEQ_MAX_BYTES = 12 * 1024 * 1024;
const MAX_JOBS = 12;

const FILE_NAME =
  /^(pca\.(png|pdf|svg)|pca_scores\.tsv|pca_variance\.tsv|pca_summary\.json|normalized\.tsv|qc_summary\.json|analysis_summary\.json|results\.zip|groups\.tsv|heatmap\.(svg|png)|venn\.svg|venn_membership\.tsv|go_bubble\.svg|kegg_bubble\.svg|enrichment_status\.json|de_[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.tsv|volcano_[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(svg|png)|go_[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.tsv|kegg_[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.tsv)$/;

const CONTENT: Record<string, string> = {
  png: "image/png",
  pdf: "application/pdf",
  svg: "image/svg+xml",
  tsv: "text/tab-separated-values; charset=utf-8",
  json: "application/json; charset=utf-8",
  zip: "application/zip",
};

export type AnalysisGroups = {
  control: string[];
  treatments: { name: string; samples: string[] }[];
};

export type JobMeta = {
  id: string;
  userId: string;
  createdAt: string;
  kind: "rnaseq";
  status: "ok";
};

export function rnaseqJobsRoot(): string {
  return path.join(dataDir(), "jobs", "rnaseq");
}

export function rnaseqVizRoot(): string {
  const candidates = [
    path.join(process.cwd(), "services", "rnaseq-viz"),
    path.join(process.cwd(), "..", "..", "services", "rnaseq-viz"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "rnaseq_viz", "pipeline.py"))) return candidate;
  }
  return candidates[0];
}

export function isResultFile(name: string): boolean {
  return FILE_NAME.test(name);
}

export function resultContentType(name: string): string {
  const ext = name.split(".").pop() || "";
  return CONTENT[ext] || "application/octet-stream";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function jobDir(jobId: string): string | null {
  if (!isUuid(jobId)) return null;
  const dir = path.join(rnaseqJobsRoot(), jobId);
  if (path.resolve(dir) !== path.join(path.resolve(rnaseqJobsRoot()), jobId)) return null;
  return dir;
}

export function readJobMeta(jobId: string): JobMeta | null {
  const dir = jobDir(jobId);
  if (!dir) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")) as JobMeta;
    if (meta.userId && meta.id === jobId) return meta;
  } catch {
    return null;
  }
  return null;
}

function prune(userId: string) {
  const root = rnaseqJobsRoot();
  if (!fs.existsSync(root)) return;
  const mine: { id: string; created: string }[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(root, entry.name, "meta.json"), "utf8")) as JobMeta;
      if (meta.userId === userId) mine.push({ id: entry.name, created: meta.createdAt || "" });
    } catch {
      /* incomplete */
    }
  }
  mine.sort((a, b) => a.created.localeCompare(b.created));
  while (mine.length > MAX_JOBS) {
    const old = mine.shift();
    if (!old) break;
    fs.rmSync(path.join(root, old.id), { recursive: true, force: true });
  }
}

async function withLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const root = rnaseqJobsRoot();
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, `.${userId}.lock`);
  try {
    const fd = fs.openSync(lock, "wx");
    fs.closeSync(fd);
  } catch {
    const age = Date.now() - fs.statSync(lock).mtimeMs;
    if (age < 2 * 60 * 1000) {
      throw Object.assign(new Error("已有一个转录组作业在运行"), { status: 429 });
    }
    fs.rmSync(lock, { force: true });
    const fd = fs.openSync(lock, "wx");
    fs.closeSync(fd);
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

export function runPython(root: string, args: string[], cwd = root): Promise<{ code: number; stderr: string; stdout: string }> {
  const python = process.env.RNASEQ_PYTHON || "python3";
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-B", ...args], {
      cwd,
      env: {
        PATH: process.env.PATH || "/usr/bin",
        PYTHONPATH: root,
        PYTHONIOENCODING: "utf-8",
        LANG: "C.UTF-8",
        HOME: process.env.HOME || "/tmp",
        NODE_ENV: process.env.NODE_ENV,
        RNASEQ_ANNOTATION_DIR: process.env.RNASEQ_ANNOTATION_DIR,
      } as NodeJS.ProcessEnv,
    });
    let stderr = "";
    let stdout = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 8000) stdout = stdout.slice(-8000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr: stderr.trim(), stdout: stdout.trim() });
    });
  });
}

function assertToken(value: string, label: string) {
  if (!value || value.includes(",") || value.includes("=") || value.startsWith("-") || /[\r\n\t]/.test(value)) {
    throw Object.assign(new Error(`${label} 含有不能放进分组参数的字符`), { status: 400 });
  }
}

export function parseGroups(raw: unknown): AnalysisGroups {
  if (!raw || typeof raw !== "object") {
    throw Object.assign(new Error("缺少样本分组"), { status: 400 });
  }
  const body = raw as { control?: unknown; treatments?: unknown };
  if (!Array.isArray(body.control) || !Array.isArray(body.treatments)) {
    throw Object.assign(new Error("分组需要 control 和 treatments"), { status: 400 });
  }
  const control = body.control.map((item) => String(item).trim()).filter(Boolean);
  const treatments = body.treatments.map((item) => {
    const row = item as { name?: unknown; samples?: unknown };
    const name = String(row?.name || "").trim();
    const samples = Array.isArray(row?.samples) ? row.samples.map((s) => String(s).trim()).filter(Boolean) : [];
    assertToken(name, "处理组名称");
    samples.forEach((sample) => assertToken(sample, "样本名"));
    return { name, samples };
  });
  control.forEach((sample) => assertToken(sample, "样本名"));
  if (control.length < 2 || treatments.length < 1 || treatments.some((row) => row.samples.length < 2)) {
    throw Object.assign(new Error("对照组和每个处理组都至少要有 2 个样本"), { status: 400 });
  }
  if (treatments.length > 3) {
    throw Object.assign(new Error("一次最多 3 个处理组"), { status: 400 });
  }
  return { control, treatments };
}

export async function runAnalysisJob(input: {
  userId: string;
  matrix: Buffer;
  groups: AnalysisGroups;
  species: string;
}): Promise<{ jobId: string; summary: Record<string, unknown> }> {
  const viz = rnaseqVizRoot();
  if (!fs.existsSync(path.join(viz, "rnaseq_viz", "pipeline.py"))) {
    throw Object.assign(new Error("服务器未安装转录组分析脚本"), { status: 503 });
  }
  return withLock(input.userId, async () => {
    const jobId = crypto.randomUUID();
    const dir = path.join(rnaseqJobsRoot(), jobId);
    fs.mkdirSync(dir, { recursive: true });
    const matrixPath = path.join(os.tmpdir(), `kt-rnaseq-${jobId}.tsv`);
    fs.writeFileSync(matrixPath, input.matrix);
    const args = [
      "-m",
      "rnaseq_viz",
      "run",
      "--matrix",
      matrixPath,
      "--control",
      input.groups.control.join(","),
      "--out-dir",
      dir,
    ];
    for (const treat of input.groups.treatments) {
      args.push("--treat", `${treat.name}=${treat.samples.join(",")}`);
    }
    if (input.species && input.species !== "none") {
      args.push("--species", input.species);
    }
    let result: { code: number; stderr: string };
    try {
      result = await runPython(viz, args);
    } catch (err) {
      fs.rmSync(matrixPath, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      const missing = err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
      throw Object.assign(new Error(missing ? "服务器未安装 python3" : "分析进程无法启动"), { status: 503 });
    }
    fs.rmSync(matrixPath, { force: true });
    if (result.code !== 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      const message =
        result.code === 2
          ? result.stderr.split("\n").filter(Boolean).at(-1) || "表达矩阵或分组无法分析"
          : "转录组分析失败";
      throw Object.assign(new Error(message), { status: result.code === 2 ? 400 : 500 });
    }
    let summary: Record<string, unknown>;
    try {
      summary = JSON.parse(fs.readFileSync(path.join(dir, "analysis_summary.json"), "utf8")) as Record<string, unknown>;
    } catch {
      fs.rmSync(dir, { recursive: true, force: true });
      throw Object.assign(new Error("分析未写出结果"), { status: 500 });
    }
    const meta: JobMeta = {
      id: jobId,
      userId: input.userId,
      createdAt: new Date().toISOString(),
      kind: "rnaseq",
      status: "ok",
    };
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    prune(input.userId);
    return { jobId, summary };
  });
}
