import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type RnaseqJobStatus = "queued" | "running" | "succeeded" | "failed";

export type RnaseqJob = {
  id: string;
  userId: string;
  status: RnaseqJobStatus;
  createdAt: string;
  finishedAt?: string;
  species: string;
  error?: string;
  summary?: {
    n_genes?: number;
    n_samples?: number;
    n_up?: number;
    n_down?: number;
    control_label?: string;
    treatment_label?: string;
    enrichment?: string;
  };
};

function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const monorepo = path.join(process.cwd(), "..", "..", "data");
  if (fs.existsSync(monorepo)) return monorepo;
  return path.join(process.cwd(), "data");
}

function jobsRoot() {
  return path.join(resolveDataDir(), "rnaseq-jobs");
}

function pipelineRoot() {
  const candidates = [
    path.join(process.cwd(), "..", "..", "services", "rnaseq-pipeline"),
    path.join(process.cwd(), "services", "rnaseq-pipeline"),
    process.env.RNASEQ_PIPELINE_ROOT || "",
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "keyantong_rnaseq"))) return c;
  }
  return candidates[0];
}

function jobDir(id: string) {
  return path.join(jobsRoot(), id);
}

function readMeta(id: string): RnaseqJob | null {
  const p = path.join(jobDir(id), "job.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as RnaseqJob;
}

function writeMeta(job: RnaseqJob) {
  const dir = jobDir(job.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify(job, null, 2));
}

export function getRnaseqJob(id: string, userId: string): RnaseqJob | null {
  const job = readMeta(id);
  if (!job || job.userId !== userId) return null;
  return job;
}

export function getRnaseqBundlePath(id: string, userId: string): string | null {
  const job = getRnaseqJob(id, userId);
  if (!job || job.status !== "succeeded") return null;
  const bundle = path.join(jobDir(id), "out", "rnaseq_results.zip");
  return fs.existsSync(bundle) ? bundle : null;
}

/**
 * Dev/local job runner: writes uploads, then runs the Python CLI synchronously.
 * Matches the product I/O contract (matrix + groups -> bundle). Swap for a queue later.
 */
export function runRnaseqJobSync(opts: {
  userId: string;
  matrixBuf: Buffer;
  matrixName: string;
  groupsBuf: Buffer;
  groupsName: string;
  species?: string;
}): RnaseqJob {
  const id = randomUUID();
  const dir = jobDir(id);
  const inputDir = path.join(dir, "input");
  const outDir = path.join(dir, "out");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const matrixPath = path.join(inputDir, sanitizeName(opts.matrixName) || "matrix.csv");
  const groupsPath = path.join(inputDir, sanitizeName(opts.groupsName) || "groups.csv");
  fs.writeFileSync(matrixPath, opts.matrixBuf);
  fs.writeFileSync(groupsPath, opts.groupsBuf);

  let job: RnaseqJob = {
    id,
    userId: opts.userId,
    status: "running",
    createdAt: new Date().toISOString(),
    species: opts.species || "none",
  };
  writeMeta(job);

  const root = pipelineRoot();
  const py = process.env.PYTHON_BIN || "python3";
  const result = spawnSync(
    py,
    [
      "-m",
      "keyantong_rnaseq",
      "--matrix",
      matrixPath,
      "--groups",
      groupsPath,
      "--outdir",
      outDir,
      "--species",
      job.species,
    ],
    {
      cwd: root,
      env: { ...process.env, PYTHONPATH: root + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : "") },
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    job = {
      ...job,
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: (result.stderr || result.stdout || "pipeline failed").slice(0, 2000),
    };
    writeMeta(job);
    return job;
  }

  let summary: RnaseqJob["summary"] = {};
  try {
    const parsed = JSON.parse(result.stdout || "{}") as Record<string, unknown>;
    summary = {
      n_genes: numberOrUndef(parsed.n_genes),
      n_samples: numberOrUndef(parsed.n_samples),
      n_up: numberOrUndef(parsed.n_up),
      n_down: numberOrUndef(parsed.n_down),
      control_label: typeof parsed.control_label === "string" ? parsed.control_label : undefined,
      treatment_label: typeof parsed.treatment_label === "string" ? parsed.treatment_label : undefined,
      enrichment: typeof parsed.enrichment === "string" ? parsed.enrichment : undefined,
    };
  } catch {
    summary = {};
  }

  job = {
    ...job,
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    summary,
  };
  writeMeta(job);
  return job;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function numberOrUndef(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
