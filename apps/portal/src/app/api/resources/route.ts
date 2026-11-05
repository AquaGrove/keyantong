import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import {
  listResources,
  submitResource,
  reviseResource,
} from "@/lib/resources/store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind && !["genome", "tool"].includes(kind))
      return NextResponse.json({ error: "无效类型" }, { status: 400 });
    return NextResponse.json({
      resources: await listResources(kind || undefined),
    });
  } catch {
    return NextResponse.json(
      { error: "目录暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user)
      return NextResponse.json(
        { error: "请先登录后补充资源" },
        { status: 401 },
      );
    const reader = request.body?.getReader();
    if (!reader)
      return NextResponse.json({ error: "缺少资源说明" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 18000) {
        await reader.cancel();
        return NextResponse.json({ error: "资源说明过长" }, { status: 413 });
      }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw.length > 18000)
      return NextResponse.json({ error: "说明过长" }, { status: 413 });
    const body = JSON.parse(raw);
    const result =
      typeof body.id === "string"
        ? await reviseResource(user.id, body.id, body.version, body)
        : await submitResource(user.id, body);
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    if (e.code === "23505")
      return NextResponse.json(
        { error: "该网址已收录或正在审核，请勿重复提交" },
        { status: 409 },
      );
    if (e instanceof SyntaxError)
      return NextResponse.json({ error: "提交格式不正确" }, { status: 400 });
    const message = e instanceof Error ? e.message : "";
    if (!e.code && /^[\u3400-\u9fff]/.test(message))
      return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json(
      { error: "提交服务暂时不可用，请稍后重试" },
      { status: 503 },
    );
  }
}
