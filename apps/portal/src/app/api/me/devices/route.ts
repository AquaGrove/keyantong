import { NextResponse } from "next/server";
import { publicUser, revokeDevice } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import { authFailure } from "@/lib/auth/http";
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (typeof body?.deviceId !== "string" || !body.deviceId.trim())
      return NextResponse.json({ error: "缺少 deviceId" }, { status: 400 });
    return NextResponse.json({
      ok: true,
      user: publicUser(await revokeDevice(user.id, body.deviceId.trim())),
    });
  } catch (e) {
    return authFailure(e);
  }
}
