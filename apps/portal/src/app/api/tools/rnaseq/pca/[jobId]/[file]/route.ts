import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "请从 /tools/rnaseq 的结果包下载" }, { status: 410 });
}
