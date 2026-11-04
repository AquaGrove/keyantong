import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { listNotifications, markRead } from "@/lib/notifications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  const items = await listNotifications(user?.id);
  return NextResponse.json({ items, authenticated: Boolean(user) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: { id?: string; action?: string };
  try {
    body = (await request.json()) as { id?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (body.action === "read" && typeof body.id === "string") {
    const ok = await markRead(body.id, user.id);
    return NextResponse.json({ ok });
  }
  return NextResponse.json({ error: "unsupported" }, { status: 400 });
}
