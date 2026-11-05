import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { rateLimit, clientIp } from "@/lib/security";
import {
  listResearchPosts,
  createResearchPost,
  communityError,
} from "@/lib/community/posts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const limit = rateLimit(`research-read:${clientIp(request)}`, {
    windowMs: 60000,
    max: 120,
  });
  if (!limit.ok)
    return NextResponse.json({ error: "访问过于频繁" }, { status: 429 });
  const url = new URL(request.url);
  const user = await currentUser();
  try {
    return NextResponse.json(
      listResearchPosts({
        kind: url.searchParams.get("kind") || undefined,
        q: url.searchParams.get("q") || undefined,
        status: url.searchParams.get("status") || undefined,
        page: Number(url.searchParams.get("page")),
        limit: Number(url.searchParams.get("limit")),
        viewer: user?.id,
      }),
    );
  } catch (e) {
    const err = communityError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "请先登录后发布" }, { status: 401 });
  const limit = rateLimit(`research-post:${user.id}`, {
    windowMs: 60000,
    max: 6,
  });
  if (!limit.ok)
    return NextResponse.json(
      { error: "发布过于频繁，请稍后再试" },
      { status: 429 },
    );
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  try {
    return NextResponse.json(
      { post: createResearchPost(body, user) },
      { status: 201 },
    );
  } catch (e) {
    const err = communityError(e);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
}
