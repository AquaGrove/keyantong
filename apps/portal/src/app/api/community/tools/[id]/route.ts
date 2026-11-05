import { NextResponse } from "next/server";
import {
  getToolPost,
  patchToolPost,
  toPublic,
} from "@/lib/community/tool-posts";
import { clientIp, rateLimit } from "@/lib/security";
import { currentUser } from "@/lib/user-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const ip = clientIp(request);
  const rl = rateLimit(`community:tools:getid:${ip}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const { id } = await ctx.params;
  const post = getToolPost(id);
  if (!post) return NextResponse.json({ error: "未找到" }, { status: 404 });
  return NextResponse.json({ post: toPublic(post) });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const ip = clientIp(request);
  const rl = rateLimit(`community:tools:patch:${ip}`, {
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return NextResponse.json({ error: "请求体无效" }, { status: 400 });

  const status = body.status != null ? String(body.status) : undefined;
  const linkedShareId =
    body.linkedShareId === null
      ? null
      : body.linkedShareId != null
        ? String(body.linkedShareId)
        : body.linked_share_id != null
          ? String(body.linked_share_id)
          : undefined;

  const resolveRaw = body.resolveWithShare || body.resolve_with_share;
  let resolveWithShare:
    | {
        title: string;
        description: string;
        downloadUrl: string;
        tags?: unknown;
        category?: string;
      }
    | undefined;
  if (resolveRaw && typeof resolveRaw === "object") {
    const r = resolveRaw as Record<string, unknown>;
    resolveWithShare = {
      title: String(r.title || ""),
      description: String(r.description || ""),
      downloadUrl: String(r.downloadUrl || r.download_url || ""),
      tags: r.tags,
      category: r.category != null ? String(r.category) : undefined,
    };
  }

  const result = patchToolPost(
    id,
    {
      status: status as "open" | "resolved" | "archived" | undefined,
      linkedShareId,
      resolveWithShare,
    },
    { id: user.id, email: user.email },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({
    post: result.post,
    createdShare: result.createdShare ?? null,
  });
}
