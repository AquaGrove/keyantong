import { NextResponse } from "next/server";
import { assertInternal } from "@/lib/internal-auth";
import { reviewQueue, reviewResource } from "@/lib/resources/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!assertInternal(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ resources: await reviewQueue() });
  } catch {
    return NextResponse.json({ error: "审核队列暂时不可用" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!assertInternal(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const b = await request.json();
    if (typeof b.id !== "string" || typeof b.note !== "string")
      throw new Error("缺少审核字段");
    return NextResponse.json(
      await reviewResource(
        b.id,
        b.version,
        b.decision,
        b.note,
        b.linkVerified === true,
      ),
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e.code ? "审核写入失败" : e.message },
      { status: 400 },
    );
  }
}
