import fs from "node:fs";
import { NextResponse } from "next/server";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import { getRnaseqBundlePath } from "@/lib/tools/rnaseq-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }
  const { jobId } = await ctx.params;
  const bundle = getRnaseqBundlePath(jobId, user.id);
  if (!bundle) return NextResponse.json({ error: "结果不存在或未完成" }, { status: 404 });
  const data = fs.readFileSync(bundle);
  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="rnaseq_${jobId.slice(0, 8)}.zip"`,
    },
  });
}
