import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dry_run";

export type BaseJob = {
  id: string;
  kind: "rnaseq" | "ncbi";
  userId: string;
  status: JobStatus | string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
  message?: string;
};

export const SOFT_MAX_CONCURRENT = 2;

export function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const monorepo = path.join(process.cwd(), "..", "..", "data");
  if (fs.existsSync(monorepo)) return monorepo;
  return path.join(process.cwd(), "data");
}

export function jobsRoot(kind: "rnaseq" | "ncbi") {
  return path.join(resolveDataDir(), kind === "rnaseq" ? "rnaseq-jobs" : "ncbi-runs");
}

export function jobDir(kind: "rnaseq" | "ncbi", id: string) {
  return path.join(jobsRoot(kind), id);
}

export function newJobId() {
  return randomUUID();
}

export function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function touchUpdated<T extends BaseJob>(job: T): T {
  return { ...job, updatedAt: new Date().toISOString() };
}

export function listJobMetas<T extends BaseJob>(kind: "rnaseq" | "ncbi", userId: string, limit = 30): T[] {
  const root = jobsRoot(kind);
  if (!fs.existsSync(root)) return [];
  const out: T[] = [];
  for (const id of fs.readdirSync(root)) {
    const meta = readJson<T>(path.join(root, id, "job.json"));
    if (!meta || meta.userId !== userId) continue;
    out.push(meta);
  }
  out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return out.slice(0, Math.max(1, limit));
}

export function quotaForUser(userId: string) {
  const rnaseq = listJobMetas("rnaseq", userId, 500);
  const ncbi = listJobMetas("ncbi", userId, 500);
  const all = [...rnaseq, ...ncbi];
  const concurrent = all.filter((j) => j.status === "queued" || j.status === "running").length;
  const softMax = Number(process.env.TOOLS_SOFT_MAX_CONCURRENT || SOFT_MAX_CONCURRENT) || SOFT_MAX_CONCURRENT;
  return {
    soft_max_concurrent: softMax,
    concurrent_running: concurrent,
    rnaseq_recent: rnaseq.length,
    ncbi_recent: ncbi.length,
    near_limit: concurrent >= softMax,
    note: "软限制：仅提示，不强制拒绝提交（可后续收紧）",
  };
}
