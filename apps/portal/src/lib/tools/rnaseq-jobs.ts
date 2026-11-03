import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { jobDir, jobsRoot, listJobMetas, newJobId, quotaForUser, readJson, resolveDataDir, writeJson } from "./job-store";

export type RnaseqJobStatus = "queued" | "running" | "succeeded" | "failed";

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

function metaPath(id: string) {
  return path.join(jobDir("rnaseq", id), "job.json");
}

function writeMeta(job: RnaseqJob) {
  writeJson(metaPath(job.id), job);
}

export function getRnaseqJob(id: string, userId: string): RnaseqJob | null {
  const job = readJson<RnaseqJob>(metaPath(id));
  if (!job || job.userId !== userId) return null;
  return job;
}

export function getRnaseqBundlePath(id: string, userId: string): string | null {
  const job = getRnaseqJob(id, userId);
  if (!job || job.status !== "succeeded") return null;
  const bundle = path.join(jobDir("rnaseq", id), "out", "rnaseq_results.zip");
  return fs.existsSync(bundle) ? bundle : null;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function numberOrUndef(v: unknown) {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
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
    message: "pipeline running",
  };
  writeMeta(running);

  const resultJsonPath = path.join(jobDir("rnaseq", job.id), "result.json");
  // Watcher process: wait for child, parse log/result
  child.unref();

  // Also attach a lightweight local waiter without blocking HTTP request:
  // spawn a tiny node inline waiter as sibling when possible.
  const waiter = spawn(
    process.execPath,
    [
      "-e",
      `
const fs=require('fs');const {spawnSync}=require('child_process');
const jobPath=${JSON.stringify(metaPath(job.id))};
const logPath=${JSON.stringify(logPath)};
const outDir=${JSON.stringify(outDir)};
const pid=${child.pid || 0};
function load(){return JSON.parse(fs.readFileSync(jobPath,'utf8'));}
function save(j){fs.writeFileSync(jobPath, JSON.stringify(j,null,2));}
function waitPid(pid){
  if(!pid) return 1;
  try{
    // poll until process gone
    for(;;){
      try{process.kill(pid,0);}catch(e){return 0;}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500);
    }
  }catch(e){return 1;}
}
// Prefer re-running sync wait via spawnSync on a noop? Instead: poll job dir for zip/manifest.
const deadline=Date.now()+60*60*1000;
let code=null;
while(Date.now()<deadline){
  if(pid){
    try{process.kill(pid,0);}catch(e){code=0;break;}
  }
  const zip=require('path').join(outDir,'rnaseq_results.zip');
  const manifest=require('path').join(outDir,'manifest.json');
  if(fs.existsSync(zip) && fs.existsSync(manifest)){code=0;break;}
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,800);
}
const zip=require('path').join(outDir,'rnaseq_results.zip');
const manifest=require('path').join(outDir,'manifest.json');
let job=load();
if(fs.existsSync(zip) && fs.existsSync(manifest)){
  let summary={};
  try{
    const m=JSON.parse(fs.readFileSync(manifest,'utf8'));
    const s=m.summary||{};
    summary={
      n_genes:s.n_genes,n_samples:s.n_samples,n_up:s.n_up,n_down:s.n_down,
      enrichment:s.enrichment,n_contrasts:s.n_contrasts,de_engine:s.de_engine||m.de_engine,
      control_label:(m.contrast&&m.contrast.control)||undefined,
      treatment_label:Array.isArray(m.contrast&&m.contrast.treatments)?m.contrast.treatments.join(','):undefined,
    };
  }catch{}
  job={...job,status:'succeeded',finishedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary,message:'done'};
  save(job);
  process.exit(0);
}
const log=fs.existsSync(logPath)?fs.readFileSync(logPath,'utf8').slice(-2000):'pipeline failed';
job={...job,status:'failed',finishedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),error:log,message:'failed'};
save(job);
process.exit(1);
`,
    ],
    { detached: true, stdio: "ignore" },
  );
  waiter.unref();
}

/**
 * Async enqueue: returns immediately with queued/running; client polls GET.
 */
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
  const job: RnaseqJob = {
    id,
    kind: "rnaseq",
    userId: opts.userId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    species: opts.species || "none",
    message: "queued",
  };
  writeMeta(job);
  launchPipeline(job, matrixPath, groupsPath, outDir, opts.lfc, opts.padj);
  return getRnaseqJob(id, opts.userId) || job;
}

/** @deprecated sync path kept for smoke/scripts */
export function runRnaseqJobSync(opts: {
  userId: string;
  matrixBuf: Buffer;
  matrixName: string;
  groupsBuf: Buffer;
  groupsName: string;
  species?: string;
  lfc?: number;
  padj?: number;
}): RnaseqJob {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
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
  let job: RnaseqJob = {
    id,
    kind: "rnaseq",
    userId: opts.userId,
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    species: opts.species || "none",
  };
  writeMeta(job);
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
  if (typeof opts.lfc === "number" && Number.isFinite(opts.lfc)) args.push("--lfc", String(opts.lfc));
  if (typeof opts.padj === "number" && Number.isFinite(opts.padj)) args.push("--padj", String(opts.padj));
  const result = spawnSync(py, args, {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : "") },
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    job = {
      ...job,
      status: "failed",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      n_contrasts: Array.isArray(parsed.contrasts) ? parsed.contrasts.length : numberOrUndef(parsed.n_contrasts),
      de_engine: typeof parsed.de_engine === "string" ? parsed.de_engine : undefined,
    };
  } catch {
    summary = {};
  }
  job = { ...job, status: "succeeded", finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), summary };
  writeMeta(job);
  return job;
}

export function ensureJobsRoot() {
  fs.mkdirSync(jobsRoot("rnaseq"), { recursive: true });
  return resolveDataDir();
}


export function listRnaseqJobs(userId: string, limit = 30): RnaseqJob[] {
  return listJobMetas<RnaseqJob>("rnaseq", userId, limit);
}

export function rnaseqDownloadAvailable(job: RnaseqJob): boolean {
  if (job.status !== "succeeded") return false;
  const bundle = path.join(jobDir("rnaseq", job.id), "out", "rnaseq_results.zip");
  return fs.existsSync(bundle);
}

export { quotaForUser };
