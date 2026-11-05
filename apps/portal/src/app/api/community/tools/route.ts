import { NextResponse } from "next/server";
import {
  createToolPost,
  listToolPosts,
  type ToolPostType,
} from "@/lib/community/tool-posts";
import { clientIp, rateLimit } from "@/lib/security";
import { currentUser } from "@/lib/user-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`community:tools:get:${ip}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || undefined;
  const typeRaw = (url.searchParams.get("type") || "all").toLowerCase();
  const type =
    typeRaw === "tool_share" ||
    typeRaw === "tool_help" ||
    typeRaw === "share" ||
    typeRaw === "help"
      ? ((typeRaw === "share"
          ? "tool_share"
          : typeRaw === "help"
            ? "tool_help"
            : typeRaw) as ToolPostType)
      : "all";
  const tag = url.searchParams.get("tag") || undefined;
  const statusRaw = (url.searchParams.get("status") || "all").toLowerCase();
  const status =
    statusRaw === "open" || statusRaw === "resolved" || statusRaw === "archived"
      ? statusRaw
      : "all";
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(
    url.searchParams.get("pageSize") || url.searchParams.get("limit") || 20,
  );

  const result = listToolPosts({
    q,
    type: type === "all" ? "all" : type,
    tag,
    status: status === "all" ? "all" : status,
    page,
    pageSize,
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`community:tools:post:${ip}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "发帖过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const typeRaw = String(body.type || "");
  const type =
    typeRaw === "tool_share" || typeRaw === "share"
      ? "tool_share"
      : typeRaw === "tool_help" || typeRaw === "help"
        ? "tool_help"
        : null;
  if (!type) {
    return NextResponse.json(
      { error: "type 须为 tool_share 或 tool_help" },
      { status: 400 },
    );
  }

  const base = {
    title: String(body.title || ""),
    description: String(body.description || ""),
    tags: body.tags,
    category: body.category != null ? String(body.category) : undefined,
  };

  const created =
    type === "tool_share"
      ? createToolPost(
          {
            type: "tool_share",
            ...base,
            downloadUrl: String(body.downloadUrl || body.download_url || ""),
          },
          { id: user.id, email: user.email },
        )
      : createToolPost(
          {
            type: "tool_help",
            ...base,
            tried: body.tried != null ? String(body.tried) : undefined,
            expectedToolType:
              body.expectedToolType != null
                ? String(body.expectedToolType)
                : body.expected_tool_type != null
                  ? String(body.expected_tool_type)
                  : undefined,
          },
          { id: user.id, email: user.email },
        );

  if (!created.ok) {
    return NextResponse.json(
      { error: created.error },
      { status: created.status },
    );
  }
  return NextResponse.json({ post: created.post }, { status: 201 });
}
