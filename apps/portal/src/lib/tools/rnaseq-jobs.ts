import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { jobDir, jobsRoot, listJobMetas, newJobId, quotaForUser, readJson, resolveDataDir, writeJson } from "./job-store";

export type RnaseqJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "pending_upstream";

export type RnaseqJob = {
  id: string;
  kind: "rnaseq";
  userId: string;
  status: RnaseqJobStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  species: string;
  error?: string;
  message?: string;
  /** When set, job is consumed by rnaseq-worker under RNASEQ_DATA_ROOT */
  dispatch?: "local" | "worker";
  summary?: {
    n_genes?: number;
    n_samples?: number;
    n_up?: number;
    n_down?: number;
    control_label?: string;
    treatment_label?: string;
    enrichment?: string;
    n_contrasts?: number;
    de_engine?: string;
  };
};

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

/** Shared volume with rnaseq-worker (compose: /data/rnaseq). */
export function workerDataRoot(): string | null {
  const root = (process.env.RNASEQ_DATA_ROOT || "").trim();
  if (!root) return null;
  try {
    fs.mkdirSync(path.join(root, "jobs"), { recursive: true });
    fs.accessSync(root, fs.constants.W_OK);
    return root;
  } catch {
    return null;
  }
}

function useWorkerDispatch(): boolean {
  if (process.env.RNASEQ_FORCE_LOCAL === "1") return false;
  return Boolean(workerDataRoot());
}

function metaPath(id: string) {
  return path.join(jobDir("rnaseq", id), "job.json");
}

function writeMeta(job: RnaseqJob) {
  writeJson(metaPath(job.id), job);
}

function workerJobDir(id: string) {
  const root = workerDataRoot();
  if (!root) throw new Error("RNASEQ_DATA_ROOT missing");
  return path.join(root, "jobs", id);
}

function workerMetaPath(id: string) {
  return path.join(workerJobDir(id), "job.json");
}

function workerResultZip(id: string) {
  const root = workerDataRoot();
  if (!root) return null;
  const candidates = [
    path.join(root, "results", id, "rnaseq_results.zip"),
    path.join(root, "results", id, "out", "rnaseq_results.zip"),
    path.join(root, "jobs", id, "out", "rnaseq_results.zip"),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function numberOrUndef(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function syncFromWorker(job: RnaseqJob): RnaseqJob {
  if (job.dispatch !== "worker") return job;
  const wp = workerMetaPath(job.id);
  if (!fs.existsSync(wp)) return job;
  try {
    const w = JSON.parse(fs.readFileSync(wp, "utf8")) as Record<string, unknown>;
    const status = String(w.status || job.status) as RnaseqJobStatus;
    const next: RnaseqJob = {
      ...job,
      status,
      updatedAt: new Date().toISOString(),
      message: typeof w.message === "string" ? w.message : job.message,
      error: typeof w.error === "string" ? w.error : job.error,
    };
    if (status === "succeeded" || status === "failed" || status === "pending_upstream") {
      next.finishedAt = next.finishedAt || new Date().toISOString();
    }
    const summary = w.summary;
    if (summary && typeof summary === "object") {
      const s = summary as Record<string, unknown>;
      next.summary = {
        n_genes: numberOrUndef(s.n_genes),
        n_samples: numberOrUndef(s.n_samples),
        n_up: numberOrUndef(s.n_up),
        n_down: numberOrUndef(s.n_down),
        control_label: typeof s.control_label === "string" ? s.control_label : undefined,
        treatment_label: typeof s.treatment_label === "string" ? s.treatment_label : undefined,
        enrichment: typeof s.enrichment === "string" ? s.enrichment : undefined,
        n_contrasts: numberOrUndef(s.n_contrasts),
        de_engine: typeof s.de_engine === "string" ? s.de_engine : undefined,
      };
    }
    // Mirror zip into portal job out/ for stable download path
    if (status === "succeeded") {
      const zip = workerResultZip(job.id);
      if (zip) {
        const destDir = path.join(jobDir("rnaseq", job.id), "out");
        fs.mkdirSync(destDir, { recursive: true });
        const dest = path.join(destDir, "rnaseq_results.zip");
        if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(zip).size) {
          fs.copyFileSync(zip, dest);
        }
      }
    }
    writeMeta(next);
    return next;
  } catch {
    return job;
  }
}

export function getRnaseqJob(id: string, userId: string): RnaseqJob | null {
  const job = readJson<RnaseqJob>(metaPath(id));
  if (!job || job.userId !== userId) return null;
  return syncFromWorker(job);
}

export function getRnaseqBundlePath(id: string, userId: string): string | null {
  const job = getRnaseqJob(id, userId);
  if (!job || job.status !== "succeeded") return null;
  const local = path.join(jobDir("rnaseq", id), "out", "rnaseq_results.zip");
  if (fs.existsSync(local)) return local;
  return workerResultZip(id);
}

function launchPipeline(job: RnaseqJob, matrixPath: string, groupsPath: string, outDir: string, lfc?: number, padj?: number) {
  const root = pipelineRoot();
  const py = process.env.PYTHON_BIN || "python3";
  const args = [
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
  ];
  if (typeof lfc === "number" && Number.isFinite(lfc)) args.push("--lfc", String(lfc));
  if (typeof padj === "number" && Number.isFinite(padj)) args.push("--padj", String(padj));

  const logPath = path.join(jobDir("rnaseq", job.id), "runner.log");
  const outFd = fs.openSync(logPath, "a");
  const child = spawn(py, args, {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : "") },
    stdio: ["ignore", outFd, outFd],
    detached: true,
  });
  fs.closeSync(outFd);

  const running: RnaseqJob = {
    ...job,
    status: "running",
    updatedAt: new Date().toISOString(),
    message: "pipeline running (local)",
    dispatch: "local",
  };
  writeMeta(running);
  child.unref();

  const waiter = spawn(
    process.execPath,
    [
      "-e",
      `
const fs=require('fs');
const {spawnSync}=require('child_process');
const meta=${JSON.stringify(metaPath(job.id))};
const pid=${child.pid || 0};
const resultJson=${JSON.stringify(path.join(jobDir("rnaseq", job.id), "result.json"))};
function load(){try{return JSON.parse(fs.readFileSync(meta,'utf8'))}catch{return null}}
function save(j){fs.writeFileSync(meta, JSON.stringify(j,null,2))}
if(pid){try{process.kill(pid,0)}catch{}}
const wait=spawnSync(process.execPath,['-e','setInterval(()=>{try{process.kill('+pid+',0)}catch{process.exit(0)}},500)'],{timeout:2*60*60*1000});
let j=load()||{};
try{
  let summary={};
  if(fs.existsSync(resultJson)){try{summary=JSON.parse(fs.readFileSync(resultJson,'utf8'))}catch{}}
  const zip=${JSON.stringify(path.join(outDir, "rnaseq_results.zip"))};
  const ok=fs.existsSync(zip);
  j={...j,status:ok?'succeeded':'failed',finishedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary:ok?summary:{ },error:ok?undefined:'missing rnaseq_results.zip'};
  save(j);
}catch(e){j={...j,status:'failed',error:String(e).slice(0,2000),finishedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};save(j)}
`,
    ],
    { detached: true, stdio: "ignore" },
  );
  waiter.unref();
}

function enqueueToWorker(opts: {
  id: string;
  userId: string;
  matrixPath: string;
  groupsPath: string;
  species: string;
  lfc?: number;
  padj?: number;
}) {
  const wdir = workerJobDir(opts.id);
  const inputDir = path.join(wdir, "input");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.copyFileSync(opts.matrixPath, path.join(inputDir, "matrix.csv"));
  fs.copyFileSync(opts.groupsPath, path.join(inputDir, "groups.json"));
  const workerJob = {
    id: opts.id,
    kind: "downstream",
    userId: opts.userId,
    status: "queued",
    species: opts.species,
    lfc: opts.lfc,
    padj: opts.padj,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    message: "queued for rnaseq-worker",
  };
  fs.writeFileSync(workerMetaPath(opts.id), JSON.stringify(workerJob, null, 2));
}

export function enqueueRnaseqJob(opts: {
  userId: string;
  matrixBuf: Buffer;
  matrixName: string;
  groupsBuf: Buffer;
  groupsName: string;
  species?: string;
  lfc?: number;
  padj?: number;
}): RnaseqJob {
  const id = newJobId();
  const dir = jobDir("rnaseq", id);
  const inputDir = path.join(dir, "input");
  const outDir = path.join(dir, "out");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const matrixPath = path.join(inputDir, sanitizeName(opts.matrixName) || "matrix.csv");
  const groupsPath = path.join(inputDir, sanitizeName(opts.groupsName) || "groups.json");
  fs.writeFileSync(matrixPath, opts.matrixBuf);
  fs.writeFileSync(groupsPath, opts.groupsBuf);

  const now = new Date().toISOString();
  const species = opts.species || "none";
  const worker = useWorkerDispatch();
  const job: RnaseqJob = {
    id,
    kind: "rnaseq",
    userId: opts.userId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    species,
    message: worker ? "queued for rnaseq-worker" : "queued",
    dispatch: worker ? "worker" : "local",
  };
  writeMeta(job);

  if (worker) {
    enqueueToWorker({
      id,
      userId: opts.userId,
      matrixPath,
      groupsPath,
      species,
      lfc: opts.lfc,
      padj: opts.padj,
    });
  } else {
    launchPipeline(job, matrixPath, groupsPath, outDir, opts.lfc, opts.padj);
  }
  return getRnaseqJob(id, opts.userId) || job;
}

export function ensureJobsRoot() {
  fs.mkdirSync(jobsRoot("rnaseq"), { recursive: true });
  return resolveDataDir();
}

export function listRnaseqJobs(userId: string, limit = 30): RnaseqJob[] {
  return listJobMetas<RnaseqJob>("rnaseq", userId, limit).map((j) => syncFromWorker(j));
}

export function rnaseqDownloadAvailable(job: RnaseqJob): boolean {
  if (job.status !== "succeeded") return false;
  const bundle = path.join(jobDir("rnaseq", job.id), "out", "rnaseq_results.zip");
  if (fs.existsSync(bundle)) return true;
  return Boolean(workerResultZip(job.id));
}

export { quotaForUser };
