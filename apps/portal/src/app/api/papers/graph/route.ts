import { NextResponse } from "next/server";
import { buildGraph } from "@/lib/openalex";
import { rateLimit, clientIp } from "@/lib/security";
export async function GET(request: Request) {
  const gate = rateLimit(`papers-graph:${clientIp(request)}`, {
    windowMs: 60000,
    max: 20,
  });
  if (!gate.ok)
    return NextResponse.json(
      { error: "文献查询较频繁，请稍后再试" },
      { status: 429 },
    );
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!q || q.length > 300)
    return NextResponse.json(
      { error: "请输入 300 字以内的 DOI、OpenAlex ID 或题名" },
      { status: 400 },
    );
  const { graph, error } = await buildGraph(q);
  if (!graph)
    return NextResponse.json(
      { error: error || "未找到该文献" },
      { status: error?.includes("未找到") ? 404 : 503 },
    );
  return NextResponse.json(graph);
}
