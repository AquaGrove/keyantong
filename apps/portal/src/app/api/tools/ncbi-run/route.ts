import { NextResponse } from "next/server";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import type { NcbiPayload } from "@/lib/tools/ncbi-validate";
import { enqueueNcbiJob, getNcbiJob, quotaForUser } from "@/lib/tools/ncbi-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "缺少 job id" }, { status: 400 });
  const job = getNcbiJob(id, user.id);
  if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json({ job, quota: quotaForUser(user.id) });
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

  const mode = ((body.mode || "dry-run").toLowerCase() === "run" ? "run" : "dry-run") as "dry-run" | "run";
  const job = enqueueNcbiJob({ userId: user.id, payload: body, mode });
  const quota = quotaForUser(user.id);
  return NextResponse.json({ job, quota }, { status: 202 });
}
