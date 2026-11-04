import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { jobDir, listJobMetas, newJobId, quotaForUser, readJson, writeJson } from "./job-store";
import type { NcbiPayload } from "./ncbi-validate";

export type NcbiJobStatus = "queued" | "running" | "succeeded" | "failed" | "dry_run";

export type NcbiJob = {
  id: string;
  kind: "ncbi";
  userId: string;
  status: NcbiJobStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  mode: "dry-run" | "run";
  error?: string;
  message?: string;
  result?: Record<string, unknown>;
};

function ncbiRoot() {
  const candidates = [
    path.join(process.cwd(), "..", "..", "services", "ncbi-upload"),
    path.join(process.cwd(), "services", "ncbi-upload"),
    process.env.NCBI_UPLOAD_ROOT || "",
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "keyantong_ncbi"))) return c;
  }
  return candidates[0];
}

function metaPath(id: string) {
  return path.join(jobDir("ncbi", id), "job.json");
}

export function getNcbiJob(id: string, userId: string): NcbiJob | null {
  const job = readJson<NcbiJob>(metaPath(id));
  if (!job || job.userId !== userId) return null;
  return job;
}

/** @deprecated Portal no longer spawns ascp. Kept for reading legacy jobs only. Do not call from routes. */
export function enqueueNcbiJob(opts: {
  userId: string;
  payload: NcbiPayload;
  mode: "dry-run" | "run";
}): NcbiJob {
  const id = newJobId();
  const dir = jobDir("ncbi", id);
  fs.mkdirSync(dir, { recursive: true });
  const ascp = { ...(opts.payload.ascp || {}) } as Record<string, unknown>;
  delete ascp.key_content;
  delete ascp.private_key;
  delete ascp.key;
  const safePayload = {
    bioproject: opts.payload.bioproject,
    biosample: opts.payload.biosample,
    library: opts.payload.library,
    files: opts.payload.files,
    ascp,
  };
  const payloadPath = path.join(dir, "payload.json");
  fs.writeFileSync(payloadPath, JSON.stringify(safePayload, null, 2));

  const now = new Date().toISOString();
  let job: NcbiJob = {
    id,
    kind: "ncbi",
    userId: opts.userId,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    mode: opts.mode,
    message: "queued",
  };
  writeJson(metaPath(id), job);

  if (process.env.NCBI_ALLOW_SERVER_ASCP !== "1") {
    job = {
      ...job,
      status: "failed",
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error:
        "SERVER_ASCP_DISABLED: 测序上传必须在用户本机执行。请使用 /api/tools/ncbi-run 返回的本地助手脚本。",
      message: "server ascp disabled",
    };
    writeJson(metaPath(id), job);
    return job;
  }

  const root = ncbiRoot();
  const py = process.env.PYTHON_BIN || "python3";
  const args = ["-m", "keyantong_ncbi", "--payload", payloadPath, "--outdir", dir];
  if (opts.mode === "run") args.push("--run");
  else args.push("--dry-run");

  const logPath = path.join(dir, "runner.log");
  const outFd = fs.openSync(logPath, "a");
  const child = spawn(py, args, {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : "") },
    stdio: ["ignore", outFd, outFd],
    detached: true,
  });
  fs.closeSync(outFd);
  job = { ...job, status: "running", updatedAt: new Date().toISOString(), message: "running" };
  writeJson(metaPath(id), job);
  child.unref();

  const waiter = spawn(
    process.execPath,
    [
      "-e",
      `
const fs=require('fs');const path=require('path');
const jobPath=${JSON.stringify(metaPath(id))};
const statusPath=${JSON.stringify(path.join(dir, "status.json"))};
const logPath=${JSON.stringify(logPath)};
const pid=${child.pid || 0};
const deadline=Date.now()+2*60*60*1000;
function load(){return JSON.parse(fs.readFileSync(jobPath,'utf8'));}
function save(j){fs.writeFileSync(jobPath, JSON.stringify(j,null,2));}
while(Date.now()<deadline){
  if(fs.existsSync(statusPath)){
    try{
      const st=JSON.parse(fs.readFileSync(statusPath,'utf8'));
      if(st.status && st.status!=='queued' && st.status!=='running'){
        let job=load();
        const ok=!!st.ok || st.status==='dry_run';
        job={...job, status: st.status==='dry_run'?'dry_run':(ok?'succeeded':'failed'),
          finishedAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
          message:st.message||st.status, result:st,
          error: ok?undefined:(st.message||'ncbi run failed')};
        save(job); process.exit(ok?0:1);
      }
    }catch{}
  }
  if(pid){ try{process.kill(pid,0);}catch(e){
    // process ended; wait a beat for status.json
  }}
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700);
}
let job=load();
const log=fs.existsSync(logPath)?fs.readFileSync(logPath,'utf8').slice(-2000):'timeout';
job={...job,status:'failed',finishedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),error:log};
save(job); process.exit(1);
`,
    ],
    { detached: true, stdio: "ignore" },
  );
  waiter.unref();
  return job;
}


export function listNcbiJobs(userId: string, limit = 30): NcbiJob[] {
  return listJobMetas<NcbiJob>("ncbi", userId, limit);
}

export { quotaForUser };
