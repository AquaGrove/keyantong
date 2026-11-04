import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/campus";
import { consumeCode, getUserByEmail, upsertUser } from "@/lib/user-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      email?: string;
      code?: string;
    } | null;
    const email = normalizeEmail(body?.email || "");
    const code = (body?.code || "").trim();
    const user = getUserByEmail(email);
    if (!user) {
      return NextResponse.json({ ok: false, error: "请先注册" }, { status: 400 });
    }
    if (!consumeCode(email, code, "register")) {
      return NextResponse.json({ ok: false, error: "验证码无效或已过期" }, { status: 400 });
    }
    const now = new Date();
    user.campusVerifiedAt = now.toISOString();
    user.trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    user.membership = "trial";
    upsertUser(user);
    return NextResponse.json({
      ok: true,
      trialEndsAt: user.trialEndsAt,
      message: "校园邮箱已验证，试用 7 天已开始",
    });
  } catch (err) {
    console.error("[auth/verify]", err);
    const msg = err instanceof Error ? err.message : "验证失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
