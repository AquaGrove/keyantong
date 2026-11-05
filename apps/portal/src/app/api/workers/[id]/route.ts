import { NextResponse } from "next/server";
import { deleteWorker, getWorker, readMemory } from "@/lib/workers/store";
import { currentUser } from "@/lib/user-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await ctx.params;
  const agent = await getWorker(user.id, id);
  if (!agent) return NextResponse.json({ error: "未找到" }, { status: 404 });
  const memory = await readMemory(user.id, id);
  return NextResponse.json({ agent, memory });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await ctx.params;
  const ok = await deleteWorker(user.id, id);
  if (!ok) return NextResponse.json({ error: "未找到" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
