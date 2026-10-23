import { NextResponse } from "next/server";
import { getUserById, publicUser, upsertUser } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { deviceId?: string } | null;
  const deviceId = body?.deviceId?.trim();
  if (!deviceId) return NextResponse.json({ error: "缺少 deviceId" }, { status: 400 });
  const fresh = getUserById(user.id);
  if (!fresh) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  const d = fresh.devices.find((x) => x.id === deviceId);
  if (!d) return NextResponse.json({ error: "设备不存在" }, { status: 404 });
  d.revoked = true;
  upsertUser(fresh);
  return NextResponse.json({ ok: true, user: publicUser(fresh) });
}
