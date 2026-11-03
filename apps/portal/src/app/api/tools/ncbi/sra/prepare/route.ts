import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { RNASEQ_MAX_BYTES, rnaseqVizRoot, runPython } from "@/lib/rnaseq-job";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[A-Za-z0-9._-]{1,80}$/;

function isTextTable(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  return !buf.subarray(0, Math.min(buf.length, 4096)).toString("utf8").includes("\uFFFD");
}

function commandFor(email: string, account: string, preload: string, keyPath: string, dataDir: string) {
  const key = keyPath.trim() || "<path/to/key_file>";
  const folder = dataDir.trim() || "<path/to/folder>";
  return `ascp -i ${key} -QT -l100m -k1 -d ${folder} ${email}:uploads/${account}/${preload}`;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录校园账号", code: "AUTH" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "试用已结束，请开通永久会员后使用 SRA 辅助", code: "PAYWALL" }, { status: 402 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "无法读取上传内容" }, { status: 400 });
  const biosample = form.get("biosample");
  const sra = form.get("sra");
  if (!(biosample instanceof File) || !(sra instanceof File)) {
    return NextResponse.json({ error: "请同时上传 BioSample 和 SRA metadata 表格" }, { status: 400 });
  }
  if (biosample.size > RNASEQ_MAX_BYTES || sra.size > RNASEQ_MAX_BYTES) {
    return NextResponse.json({ error: "单个表格不能超过 12MB" }, { status: 400 });
  }
  const bioBuf = Buffer.from(await biosample.arrayBuffer());
  const sraBuf = Buffer.from(await sra.arrayBuffer());
  if (!isTextTable(bioBuf) || !isTextTable(sraBuf)) {
    return NextResponse.json({ error: "模板需要是 UTF-8 文本" }, { status: 400 });
  }
  const email = String(form.get("email") || "").trim();
  const account = String(form.get("account") || "").trim();
  const preload = String(form.get("preload") || "").trim();
  const keyPath = String(form.get("keyPath") || "").trim();
  const dataDir = String(form.get("dataDir") || "").trim();
  if (!email.includes("@") || /\s/.test(email)) {
    return NextResponse.json({ error: "请填写提交者邮箱" }, { status: 400 });
  }
  if (!TOKEN.test(account) || !TOKEN.test(preload)) {
    return NextResponse.json({ error: "账号目录和预传文件夹名只能包含字母、数字、点、下划线和短横线" }, { status: 400 });
  }
  if (/\s/.test(keyPath) || /\s/.test(dataDir)) {
    return NextResponse.json({ error: "密钥路径和数据目录不要包含空格" }, { status: 400 });
  }

  const viz = rnaseqVizRoot();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kt-sra-"));
  try {
    const bioPath = path.join(dir, "biosample.tsv");
    const sraPath = path.join(dir, "sra.tsv");
    fs.writeFileSync(bioPath, bioBuf);
    fs.writeFileSync(sraPath, sraBuf);
    const result = await runPython(viz, [
      "-m",
      "rnaseq_viz",
      "ncbi",
      "--biosample",
      bioPath,
      "--sra",
      sraPath,
      "--email",
      email,
      "--account",
      account,
      "--preload",
      preload,
      "--out-dir",
      dir,
      "--report-only",
    ]);
    if (result.code !== 0) {
      const message = result.stderr.split("\n").filter(Boolean).at(-1) || "模板未通过校验";
      return NextResponse.json({ error: message }, { status: result.code === 2 ? 400 : 500 });
    }
    const report = JSON.parse(fs.readFileSync(path.join(dir, "ncbi_validation.json"), "utf8")) as {
      ok: boolean;
      samples: number;
      files: string[];
    };
    const ascpCommand = commandFor(email, account, preload, keyPath, dataDir);
    const script = `#!/bin/sh\n# Run on your computer. KeyanTong does not execute this and does not store the key.\nexec ${ascpCommand}\n`;
    return NextResponse.json({
      ok: true,
      samples: report.samples,
      files: report.files,
      ascpCommand,
      script,
      executed: false,
    });
  } catch (err) {
    const missing = err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
    return NextResponse.json({ error: missing ? "服务器未安装 python3" : "校验进程无法启动" }, { status: 503 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
