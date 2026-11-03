import { NextResponse } from "next/server";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import { getRnaseqJob, runRnaseqJobSync } from "@/lib/tools/rnaseq-jobs";

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
  const job = getRnaseqJob(id, user.id);
  if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }

  const form = await request.formData();
  const matrix = form.get("matrix");
  const groups = form.get("groups");
  const species = String(form.get("species") || "none");
  if (!(matrix instanceof File) || !(groups instanceof File)) {
    return NextResponse.json({ error: "请上传表达矩阵与分组表" }, { status: 400 });
  }
  if (matrix.size > 80 * 1024 * 1024 || groups.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "文件过大" }, { status: 413 });
  }

  const job = runRnaseqJobSync({
    userId: user.id,
    matrixBuf: Buffer.from(await matrix.arrayBuffer()),
    matrixName: matrix.name || "matrix.csv",
    groupsBuf: Buffer.from(await groups.arrayBuffer()),
    groupsName: groups.name || "groups.csv",
    species,
  });

  return NextResponse.json({ job }, { status: job.status === "succeeded" ? 200 : 500 });
}
