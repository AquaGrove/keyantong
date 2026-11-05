import { NextResponse } from "next/server";
import { isUsernameAccount, usernameEmail } from "@/lib/auth/account-name";
import { normalizeEmail } from "@/lib/campus";
import { verifyPassword } from "@/lib/crypto-user";
import { getUserByEmail, recordLogin } from "@/lib/user-store";
import {
  DEVICE_COOKIE,
  USER_COOKIE,
  createUserToken,
  sessionCookieOptions,
} from "@/lib/user-session";
import { clientIp, rateLimit } from "@/lib/security";
import { authFailure } from "@/lib/auth/http";
export async function POST(request: Request) {
  try {
    const gate = rateLimit(`auth:login:${clientIp(request)}`, {
      windowMs: 60000,
      max: 20,
    });
    if (!gate.ok)
      return NextResponse.json(
        { error: "登录尝试过多，请稍后重试" },
        { status: 429 },
      );
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(
      typeof body?.email === "string" ? body.email : "",
    );
    const account = typeof body?.username === "string" ? usernameEmail(body.username) : email;
    const user = account ? await getUserByEmail(account) : undefined;
    if (
      !user ||
      typeof body?.password !== "string" ||
      body.password.length > 1024 ||
      !(await verifyPassword(body.password, user.passwordHash))
    )
      return NextResponse.json(
        { ok: false, error: "邮箱或密码错误" },
        { status: 401 },
      );
    if (!user.campusVerifiedAt && !isUsernameAccount(user.email))
      return NextResponse.json(
        { error: "请先完成校园邮箱验证", needVerify: true },
        { status: 403 },
      );
    const deviceId =
      (typeof body.deviceId === "string" ? body.deviceId.trim() : "") ||
      crypto.randomUUID();
    if (deviceId.length > 200)
      return NextResponse.json({ error: "设备编号过长" }, { status: 400 });
    const label = (
      typeof body.deviceLabel === "string" ? body.deviceLabel : "browser"
    ).slice(0, 80);
    const session = await recordLogin(
      user,
      deviceId,
      label,
      body.replaceOldest === true,
    );
    const token = session || (await createUserToken(user.id));
    const res = NextResponse.json({ ok: true, deviceId });
    res.cookies.set(USER_COOKIE, token, sessionCookieOptions());
    res.cookies.set(DEVICE_COOKIE, deviceId, {
      ...sessionCookieOptions(),
      httpOnly: false,
    });
    return res;
  } catch (e) {
    return authFailure(e);
  }
}
