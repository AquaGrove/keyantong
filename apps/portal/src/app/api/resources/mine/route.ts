import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { myResources } from "@/lib/resources/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ resources: await myResources(user.id) });
  } catch {
    return NextResponse.json(
      { error: "暂时无法读取提交记录" },
      { status: 503 },
    );
  }
}
