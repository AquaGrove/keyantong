import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/campus";
import { verifyRegistration } from "@/lib/user-store";
import { rateLimit, clientIp } from "@/lib/security";
import { authFailure } from "@/lib/auth/http";
export async function POST(request: Request) {
  try {
    const gate = rateLimit(`auth:verify:${clientIp(request)}`, {
      windowMs: 60000,
      max: 20,
    });
    if (!gate.ok)
      return NextResponse.json(
        { error: "验证请求过多，请稍后重试" },
        { status: 429 },
      );
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(
      typeof body?.email === "string" ? body.email : "",
    );
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code))
      return NextResponse.json({ error: "请输入 6 位验证码" }, { status: 400 });
    const user = await verifyRegistration(email, code);
    return NextResponse.json({
      ok: true,
      trialEndsAt: user.trialEndsAt,
      message: "校园邮箱已验证，试用 7 天已开始",
    });
  } catch (e) {
    return authFailure(e);
  }
}
