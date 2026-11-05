import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { planConversation } from "@/lib/agent/planner";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { inspectFile } from "@/lib/agent/file-inspection";
import type { AgentContext } from "@/lib/agent/types";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    if (!rateLimit("agent-chat:" + ip, { windowMs: 60000, max: 35 }).ok)
      return NextResponse.json(
        { error: "我需要稍等片刻再继续，请一分钟后重试。" },
        { status: 429 },
      );
    const reader = request.body?.getReader();
    if (!reader)
      return NextResponse.json(
        { error: "请告诉我你的想法。" },
        { status: 400 },
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 48000) {
        await reader.cancel();
        return NextResponse.json(
          { error: "这段内容较长，请分几次告诉我。" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const b = JSON.parse(Buffer.concat(chunks).toString());
    if (b.inspect) {
      if (!rateLimit("agent-inspection:" + ip, { windowMs: 60000, max: 12 }).ok)
        return NextResponse.json({ inspection: null });
      const user = await currentUser();
      return NextResponse.json({ inspection: await inspectFile(b.inspect, user?.id || ip) });
    }
    if (
      typeof b.message !== "string" ||
      !b.message.trim() ||
      b.message.length > 4000
    )
      return NextResponse.json(
        { error: "请输入 1–4000 字的想法。" },
        { status: 400 },
      );
    const c: AgentContext =
      b.context && typeof b.context === "object" && !Array.isArray(b.context)
        ? b.context
        : {};
    if (c.items && !Array.isArray(c.items)) delete c.items;
    if (c.attachments && !Array.isArray(c.attachments)) delete c.attachments;
    if (c.items) c.items = c.items.slice(0, 30);
    if (c.attachments) c.attachments = c.attachments.slice(0, 8);
    const user = await currentUser();
    const history = Array.isArray(b.history) ? b.history.slice(-12).filter((m: any) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string").map((m: any) => ({role: m.role, content: m.content.slice(0, 1000)})) : [];
    const reply = await planConversation(b.message.trim(), c, user, ip, history, b.fileTurn === true);
    return NextResponse.json(reply);
  } catch (e: any) {
    const human =
      e instanceof Error && /^[\u3400-\u9fff]/.test(e.message)
        ? e.message
        : "暂时没能完成这一步。你的对话和待处理文件还在，请稍后重试。";
    return NextResponse.json({ error: human }, { status: 400 });
  }
}
