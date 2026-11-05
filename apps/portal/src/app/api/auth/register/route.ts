import { NextResponse } from "next/server";
import { isCampusEmail, normalizeEmail } from "@/lib/campus";
import { hashPassword, randomCode } from "@/lib/crypto-user";
import { usernameEmail } from "@/lib/auth/account-name";
import { registerUsername, registerWithCode } from "@/lib/user-store";
import { clientIp, rateLimit } from "@/lib/security";
import { authFailure } from "@/lib/auth/http";
export async function POST(request: Request) {
  try {
    const gate = rateLimit(`auth:register:${clientIp(request)}`, {
      windowMs: 60000,
      max: 10,
    });
    if (!gate.ok)
      return NextResponse.json(
        { error: "注册请求过多，请稍后再试" },
        { status: 429 },
      );
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(
      typeof body?.email === "string" ? body.email : "",
    );
    const password = typeof body?.password === "string" ? body.password : "";
    if (password.length < 8 || password.length > 1024)
      return NextResponse.json({ error: "密码须为 8–1024 个字符" }, { status: 400 });
    if (typeof body?.username === "string") {
      const account = usernameEmail(body.username);
      if (!account) return NextResponse.json({ error: "用户名需为 3–30 位字母、数字、下划线或短横线，并以字母或数字开头" }, { status: 400 });
      await registerUsername(account, await hashPassword(password));
      return NextResponse.json({ ok: true, needVerify: false });
    }
    if (!isCampusEmail(email))
      return NextResponse.json({ error: "请使用有效用户名注册" }, { status: 400 });
    if (process.env.EMAIL_DEV_ECHO !== "true")
      return NextResponse.json({ error: "校园邮箱注册暂未开放。请使用用户名注册；已有校园账号可以登录。" }, { status: 503 });
    const code = randomCode();
    await registerWithCode(email, await hashPassword(password), {
      email,
      code,
      purpose: "register",
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    });
    return NextResponse.json({ ok: true, needVerify: true, devCode: code });
  } catch (e) {
    return authFailure(e);
  }
}
