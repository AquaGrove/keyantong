import { NextResponse } from "next/server";
import { RNASEQ_MAX_BYTES, parseGroups, runAnalysisJob } from "@/lib/rnaseq-job";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const SPECIES = new Set(["", "none", "arabidopsis", "human", "mouse"]);

function isTextTable(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 4096)).toString("utf8");
  return !sample.includes("\uFFFD");
}

function statusOf(err: unknown): number {
  if (err && typeof err === "object" && "status" in err && typeof err.status === "number") return err.status;
  return 500;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录校园账号", code: "AUTH" }, { status: 401 });
  }
  if (!isEntitled(user)) {
    return NextResponse.json(
      { error: "试用已结束，请开通永久会员后使用转录组分析", code: "PAYWALL" },
      { status: 402 },
    );
  }
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "无法读取上传内容" }, { status: 400 });
  const matrix = form.get("matrix");
  if (!(matrix instanceof File)) return NextResponse.json({ error: "请上传表达矩阵" }, { status: 400 });
  if (!/\.(csv|tsv|txt|tab)$/i.test(matrix.name)) {
    return NextResponse.json({ error: "表达矩阵只接受 csv、tsv、txt" }, { status: 400 });
  }
  if (matrix.size <= 0 || matrix.size > RNASEQ_MAX_BYTES) {
    return NextResponse.json({ error: "表达矩阵不能为空，且不超过 12MB" }, { status: 400 });
  }
  const matrixBuf = Buffer.from(await matrix.arrayBuffer());
  if (!isTextTable(matrixBuf)) {
    return NextResponse.json({ error: "表达矩阵需要是 UTF-8 文本，不能是 Excel 二进制" }, { status: 400 });
  }
  let groups;
  try {
    groups = parseGroups(JSON.parse(String(form.get("groups") || "")));
  } catch (err) {
    const message = err instanceof Error ? err.message : "分组无法解析";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const species = String(form.get("species") || "none");
  if (!SPECIES.has(species)) {
    return NextResponse.json({ error: "物种只能是 arabidopsis、human、mouse 或不做富集" }, { status: 400 });
  }
  try {
    const { jobId, summary } = await runAnalysisJob({
      userId: user.id,
      matrix: matrixBuf,
      groups,
      species,
    });
    const base = `/api/tools/rnaseq/${jobId}`;
    return NextResponse.json({ ok: true, jobId, summary, base });
  } catch (err) {
    const status = statusOf(err);
    const message = err instanceof Error ? err.message : "转录组分析失败";
    return NextResponse.json({ error: message }, { status });
  }
}
