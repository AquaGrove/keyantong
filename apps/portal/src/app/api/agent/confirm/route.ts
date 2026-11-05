import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { currentUser } from "@/lib/user-session";
import { transaction } from "@/lib/db/pool";
import { verifyAction } from "@/lib/agent/tickets";
import { submitResource, reviseResource } from "@/lib/resources/store";
import {
  createResearchPost,
  respondToPost,
  acceptResponse,
} from "@/lib/community/posts";
import { createWorker } from "@/lib/workers/store";
import { revokeDevice } from "@/lib/user-store";
import { markRead } from "@/lib/notifications/store";
import { rateLimit } from "@/lib/security/rate-limit";
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user)
      return NextResponse.json(
        { error: "请先在对话中登录，草稿会保留。" },
        { status: 401 },
      );
    if (!rateLimit("agent-confirm:" + user.id, { windowMs: 60000, max: 12 }).ok)
      return NextResponse.json(
        { error: "操作较频繁，请稍后再继续。" },
        { status: 429 },
      );
    const text = await request.text();
    if (text.length > 25000)
      return NextResponse.json({ error: "确认内容过长" }, { status: 413 });
    const b = JSON.parse(text);
    if (typeof b.ticket !== "string") throw new Error("请先整理好要执行的内容");
    const action = verifyAction(b.ticket, user.id);
    const phrase =
      action.kind === "resource"
        ? "确认提交"
        : action.kind === "worker"
          ? "确认创建"
          : action.kind === "revoke_device"
            ? "确认注销"
            : action.kind === "read_notice"
              ? "确认已读"
              : action.kind === "accept_reply"
                ? "确认采纳"
                : "确认发布";
    if (b.confirmation !== phrase)
      throw new Error("请明确回复“" + phrase + "”");
    const result = await transaction(
      "app",
      async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,42))", [
          user.id,
        ]);
        const hash = createHash("sha256")
          .update(JSON.stringify(action.payload))
          .digest("hex");
        const existing = (
          await c.query("SELECT * FROM kt_ops.agent_actions WHERE id=$1", [
            action.id,
          ])
        ).rows[0];
        if (existing) {
          if (existing.payload_sha256 !== hash)
            throw new Error("操作内容已变化");
          return existing.result;
        }
        let reply: string;
        let commands: unknown[] = [];
        const p = action.payload;
        if (action.kind === "resource") {
          if (typeof p.id === "string")
            await reviseResource(user.id, p.id, Number(p.version), p, c);
          else await submitResource(user.id, p, action.id, c);
          reply = "已提交到后台审核。通过后才会公开；你可以随时问我审核进度。";
        } else if (action.kind === "post") {
          const post = createResearchPost(p, user, action.id);
          reply = "内容已发布，其他研究者可以看到并回应。";
          commands = [{ type: "navigate", workspace: "post", id: post.id }];
        } else if (action.kind === "reply") {
          respondToPost(String(p.id), p, user, action.id);
          reply = "回应已发布。";
          commands = [
            { type: "navigate", workspace: "post", id: String(p.id) },
          ];
        } else if (action.kind === "worker") {
          const r = await createWorker(
            user.id,
            {
              name: String(p.name),
              kind: p.kind === "pet" ? "pet" : "worker",
              persona: String(p.persona),
              skills: Array.isArray(p.skills) ? p.skills.map(String) : [],
            },
            "w_" + action.id.replaceAll("-", ""),
          );
          if (!r.ok) throw new Error(r.error);
          reply = `${r.agent.name} 已经准备好陪你一起工作。你可以说“打开第一个”，开始和它交流。`;
          commands = [{ type: "navigate", workspace: "workers" }];
        } else if (action.kind === "revoke_device") {
          await revokeDevice(user.id, String(p.deviceId));
          reply = "该设备的登录会话已撤销。";
          commands = [{ type: "navigate", workspace: "account" }];
        } else if (action.kind === "accept_reply") {
          acceptResponse(String(p.id), p.responseId, user.id);
          reply = "已采纳该回应。";
          commands = [{ type: "refresh" }];
        } else {
          await markRead(String(p.id), user.id);
          reply = "已标记为已读。";
          commands = [{ type: "refresh" }];
        }
        const value = { reply, commands, draft: null };
        await c.query(
          "INSERT INTO kt_ops.agent_actions(id,owner_id,kind,payload_sha256,result) VALUES($1,$2,$3,$4,$5)",
          [action.id, user.id, action.kind, hash, value],
        );
        return value;
      },
      user.id,
    );
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e.code === "23505"
            ? "该网址已收录或正在审核。"
            : e instanceof Error && /^[\u3400-\u9fff]/.test(e.message)
              ? e.message
              : "暂时未完成，请稍后重试；重复确认不会重复执行。",
      },
      { status: 400 },
    );
  }
}
