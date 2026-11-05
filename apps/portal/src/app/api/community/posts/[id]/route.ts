import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { rateLimit } from "@/lib/security";
import {
  getResearchPost,
  respondToPost,
  acceptResponse,
  communityError,
} from "@/lib/community/posts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await currentUser();
  try {
    const post = getResearchPost(id, user?.id);
    return post
      ? NextResponse.json({ post })
      : NextResponse.json({ error: "动态不存在" }, { status: 404 });
  } catch (e) {
    const err = communityError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}
async function mutate(request: Request, ctx: Ctx, accept: boolean) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "请先登录后响应" }, { status: 401 });
  const gate = rateLimit(`research-response:${user.id}`, {
    windowMs: 60000,
    max: 15,
  });
  if (!gate.ok)
    return NextResponse.json({ error: "操作过于频繁" }, { status: 429 });
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  try {
    return NextResponse.json({
      post: accept
        ? acceptResponse(id, body.responseId, user.id)
        : respondToPost(id, body, user),
    });
  } catch (e) {
    const err = communityError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}
export const POST = (r: Request, c: Ctx) => mutate(r, c, false);
export const PATCH = (r: Request, c: Ctx) => mutate(r, c, true);
