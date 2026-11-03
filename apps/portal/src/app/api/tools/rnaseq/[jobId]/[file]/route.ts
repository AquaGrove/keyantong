import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { isResultFile, jobDir, readJobMeta, resultContentType } from "@/lib/rnaseq-job";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ jobId: string; file: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录校园账号", code: "AUTH" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "试用已结束，请开通永久会员后查看分析结果", code: "PAYWALL" }, { status: 402 });
  }
  const { jobId, file } = await ctx.params;
  if (!isResultFile(file)) return NextResponse.json({ error: "没有这个结果文件" }, { status: 404 });
  const meta = readJobMeta(jobId);
  const dir = jobDir(jobId);
  if (!meta || !dir || meta.userId !== user.id) {
    return NextResponse.json({ error: "没有这个结果" }, { status: 404 });
  }
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "结果文件已删除" }, { status: 404 });
  const download = !file.endsWith(".svg") && !file.endsWith(".png");
  return new NextResponse(new Uint8Array(fs.readFileSync(filePath)), {
    headers: {
      "Content-Type": resultContentType(file),
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file}"`,
    },
  });
}
