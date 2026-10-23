import { NextResponse } from "next/server";
import { buildGraph } from "@/lib/openalex";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录", code: "AUTH" }, { status: 401 });
  }
  if (!isEntitled(user)) {
    return NextResponse.json(
      { error: "试用已结束，请开通永久会员后继续使用文献关系网", code: "PAYWALL" },
      { status: 402 },
    );
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!q) return NextResponse.json({ error: "缺少查询" }, { status: 400 });
  const { graph, error } = await buildGraph(q);
  if (!graph) return NextResponse.json({ error: error || "未找到该文献" }, { status: 404 });
  return NextResponse.json(graph);
}
