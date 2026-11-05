import { NextResponse } from "next/server";
import { searchWorks } from "@/lib/openalex";
import { rateLimit, clientIp } from "@/lib/security";
export async function GET(request: Request) {
  const gate = rateLimit(`papers-search:${clientIp(request)}`, {
    windowMs: 60000,
    max: 40,
  });
  if (!gate.ok)
    return NextResponse.json(
      { error: "查询过于频繁，请稍后再试" },
      { status: 429 },
    );
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 3 || q.length > 300)
    return NextResponse.json(
      { error: "请输入 3–300 字的题名、关键词或 DOI" },
      { status: 400 },
    );
  const { results, error } = await searchWorks(q);
  return NextResponse.json({ results, error }, { status: error ? 503 : 200 });
}
