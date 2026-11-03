import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type BaseJob = {
  id: string;
  kind: "rnaseq" | "ncbi";
  userId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
  message?: string;
};

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
