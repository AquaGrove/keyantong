import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import type { NcbiPayload } from "@/lib/tools/ncbi-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const monorepo = path.join(process.cwd(), "..", "..", "data");
  if (fs.existsSync(monorepo)) return monorepo;
  return path.join(process.cwd(), "data");
}

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

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }

  let body: NcbiPayload & { mode?: string };
  try {
    body = (await request.json()) as NcbiPayload & { mode?: string };
  } catch {
    return NextResponse.json({ error: "JSON 无效" }, { status: 400 });
  }

  if (body?.ascp && typeof (body.ascp as { key_content?: string }).key_content === "string") {
    return NextResponse.json({ error: "禁止上传密钥内容，请只填本机绝对路径" }, { status: 400 });
  }

  const mode = (body.mode || "dry-run").toLowerCase();
  const dry = mode !== "run";
  const id = randomUUID();
  const outDir = path.join(resolveDataDir(), "ncbi-runs", id);
  fs.mkdirSync(outDir, { recursive: true });
  const payloadPath = path.join(outDir, "payload.json");
  // strip any accidental key material fields
  const ascp = { ...(body.ascp || {}) } as Record<string, unknown>;
  delete ascp.key_content;
  delete ascp.private_key;
  delete ascp.key;
  const safePayload = {
    bioproject: body.bioproject,
    biosample: body.biosample,
    library: body.library,
    files: body.files,
    ascp,
  };
  fs.writeFileSync(payloadPath, JSON.stringify(safePayload, null, 2));

  const root = ncbiRoot();
  const py = process.env.PYTHON_BIN || "python3";
  const args = ["-m", "keyantong_ncbi", "--payload", payloadPath, "--outdir", outDir];
  if (dry) args.push("--dry-run");
  else args.push("--run");

  const result = spawnSync(py, args, {
    cwd: root,
    env: { ...process.env, PYTHONPATH: root + (process.env.PYTHONPATH ? `:${process.env.PYTHONPATH}` : "") },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });

  if (result.status !== 0 && !result.stdout) {
    return NextResponse.json(
      {
        error: (result.stderr || "ncbi runner failed").slice(0, 2000),
        status: "failed",
        ok: false,
        dry_run: dry,
      },
      { status: 500 },
    );
  }

  try {
    const parsed = JSON.parse(result.stdout || "{}");
    return NextResponse.json(parsed, { status: parsed.ok || parsed.status === "dry_run" ? 200 : 400 });
  } catch {
    // fallback to status.json on disk
    const statusFile = path.join(outDir, "status.json");
    if (fs.existsSync(statusFile)) {
      return NextResponse.json(JSON.parse(fs.readFileSync(statusFile, "utf8")));
    }
    return NextResponse.json(
      { error: "无法解析 runner 输出", raw: (result.stdout || result.stderr || "").slice(0, 1000) },
      { status: 500 },
    );
  }
}
