import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { analysisJobs } from "@/lib/analysis/jobs";
import { downloadUrl } from "@/lib/storage/objects";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { id } = await params;
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    )
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    const job = (await analysisJobs(user.id, id))[0];
    if (!job || job.status !== "succeeded" || !job.result_object_id)
      return NextResponse.json(
        { error: "结果尚未就绪或无权访问" },
        { status: 404 },
      );
    const r = await fetch(await downloadUrl(user.id, job.result_object_id), {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("storage unavailable");
    return new NextResponse(r.body, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="keyantong-${id}.zip"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "结果暂时不可下载" }, { status: 503 });
  }
}
