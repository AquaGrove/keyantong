import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { transaction } from "@/lib/db/pool";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return error("请先登录，再查看任务历史。", 401);
  const id = new URL(request.url).searchParams.get("id");
  if (id && !uuid.test(id)) return error("任务编号无效。", 400);
  const rows = await transaction("app", async client => {
    if (id) return (await client.query(
      "SELECT id,title,snapshot,version,updated_at FROM kt_ops.conversation_history WHERE owner_id=$1 AND id=$2",
      [user.id, id],
    )).rows;
    return (await client.query(
      "SELECT id,title,version,updated_at FROM kt_ops.conversation_history WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 100",
      [user.id],
    )).rows;
  }, user.id);
  return id ? rows[0] ? NextResponse.json({ task: rows[0] }) : error("没有找到该任务。", 404)
    : NextResponse.json({ tasks: rows });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return error("请先登录，再保存任务。", 401);
  const reader = request.body?.getReader();
  if (!reader) return error("缺少任务内容。", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 1024 * 1024) {
      await reader.cancel();
      return error("任务内容过长。", 413);
    }
    chunks.push(value);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return error("任务格式无效。", 400); }
  const {id, title, version, snapshot} = data || {};
  if (typeof id !== "string" || !uuid.test(id) || typeof title !== "string" || !title.trim() || title.length > 100 ||
      !Number.isSafeInteger(version) || version < 0 || !snapshot ||
      !Array.isArray(snapshot.messages) || snapshot.messages.length > 80 ||
      !snapshot.messages.every((m: any) => m && typeof m.id === "string" && ["user","assistant"].includes(m.role) && typeof m.text === "string") ||
      !snapshot.context || typeof snapshot.context !== "object" ||
      !Array.isArray(snapshot.jobIds) || snapshot.jobIds.length > 100 ||
      !snapshot.jobIds.every((jobId: unknown) => typeof jobId === "string" && /^[a-z0-9_-]{1,80}$/i.test(jobId)))
    return error("任务格式无效。", 400);
  const task = await transaction("app", async client => {
    if (version === 0) {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 8))", [user.id]);
      const count = await client.query("SELECT count(*)::int AS count FROM kt_ops.conversation_history WHERE owner_id=$1", [user.id]);
      if (count.rows[0].count >= 100) return undefined;
      return (await client.query(
        "INSERT INTO kt_ops.conversation_history(owner_id,id,title,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id,title,version,updated_at",
        [user.id,id,title,JSON.stringify(snapshot)],
      )).rows[0];
    }
    return (await client.query(
      "UPDATE kt_ops.conversation_history SET title=$3,snapshot=$4,version=version+1,updated_at=now() WHERE owner_id=$1 AND id=$2 AND version=$5 RETURNING id,title,version,updated_at",
      [user.id,id,title,JSON.stringify(snapshot),version],
    )).rows[0];
  }, user.id);
  return task ? NextResponse.json({task}) : error("任务已在另一窗口更新，或历史已达 100 条。当前对话仍在本窗口。",409);
}
