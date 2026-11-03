import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "请改用一次分析：上传表达矩阵并提交分组到 /api/tools/rnaseq/run" },
    { status: 410 },
  );
}
