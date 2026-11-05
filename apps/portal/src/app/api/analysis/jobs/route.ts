import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { isEntitled } from "@/lib/user-store";
import { analysisJobs, createAnalysis } from "@/lib/analysis/jobs";
import { METHODS } from "@/lib/analysis/methods";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const id = new URL(request.url).searchParams.get("id") || undefined;
    if (
      id &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    )
      return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
    return NextResponse.json({ jobs: await analysisJobs(user.id, id) });
  } catch {
    return NextResponse.json({ error: "任务服务暂时不可用" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!isEntitled(user))
      return NextResponse.json(
        { error: "计算任务需要有效校园试用或永久会员" },
        { status: 403 },
      );
    if (process.env.OMICS_ENABLED !== "1")
      return NextResponse.json(
        { error: "计算环境正在部署，请稍后重试" },
        { status: 503 },
      );
    const reader = request.body?.getReader();
    if (!reader)
      return NextResponse.json({ error: "缺少输入文件" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 20 * 1024 * 1024) {
        await reader.cancel();
        return NextResponse.json(
          { error: "单次上传总计不超过 20 MB" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const bounded = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: Buffer.concat(chunks),
    });
    const form = await bounded.formData();
    const method = String(form.get("method") || "");
    const spec = METHODS.find((m) => m.id === method);
    if (!spec) throw new Error("分析方法未开放");
    if (form.get("acknowledged") !== "true")
      throw new Error("请核对当前算法适用范围");
    const files: Record<string, Buffer> = {};
    for (const name of spec.files) {
      const f = form.get(name);
      if (!(f instanceof File)) throw new Error(`缺少 ${name}`);
      if (f.size > 12 * 1024 * 1024) throw new Error("单文件限 12 MB");
      files[name] = Buffer.from(await f.arrayBuffer());
    }
    const configText = String(form.get("config") || "{}");
    if (configText.length > 1000) throw new Error("参数过长");
    return NextResponse.json(
      await createAnalysis(user.id, method, JSON.parse(configText), files),
      { status: 202 },
    );
  } catch (e: any) {
    if (e.status === 503)
      return NextResponse.json({ error: e.message }, { status: 503 });
    if (e.code || (e.name === "TypeError" && e.message.includes("fetch")))
      return NextResponse.json(
        { error: "分析存储暂时不可用，请稍后重试" },
        { status: 503 },
      );
    return NextResponse.json(
      {
        error: e.message?.startsWith("DATABASE_")
          ? "分析数据库尚未配置"
          : e.message || "提交失败",
      },
      { status: 400 },
    );
  }
}
