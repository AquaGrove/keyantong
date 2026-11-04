import { NextResponse } from "next/server";
import { isCampusEmail, normalizeEmail } from "@/lib/campus";
import { hashPassword, randomCode, randomId } from "@/lib/crypto-user";
import { sendCampusCode } from "@/lib/mail";
import { getUserByEmail, saveCode, upsertUser } from "@/lib/user-store";
import { clientIp, rateLimit } from "@/lib/security";

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`auth:register:${ip}`, { windowMs: 60_000, max: 10 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "注册请求过多，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = normalizeEmail(body?.email || "");
  const password = body?.password || "";
  if (!isCampusEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "请使用校园邮箱（.edu.cn 或 .edu）注册" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "密码至少 8 位" }, { status: 400 });
  }
  if (getUserByEmail(email)?.campusVerifiedAt) {
    return NextResponse.json({ ok: false, error: "该邮箱已注册，请直接登录" }, { status: 409 });
  }

  const existing = getUserByEmail(email);
  const user = existing ?? {
    id: randomId(),
    email,
    passwordHash: await hashPassword(password),
    campusVerifiedAt: null,
    trialEndsAt: null,
    membership: "trial" as const,
    lifetimeGrantedAt: null,
    createdAt: new Date().toISOString(),
    devices: [],
  };
  if (existing) user.passwordHash = await hashPassword(password);
  upsertUser(user);

  const code = randomCode();
  saveCode({
    email,
    code,
    purpose: "register",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  const { echoed } = await sendCampusCode(email, code);
  return NextResponse.json({
    ok: true,
    needVerify: true,
    ...(echoed ? { devCode: code } : {}),
    message: echoed
      ? "开发模式：验证码已返回（生产环境将发到校园邮箱）"
      : "验证码已发送到校园邮箱，15 分钟内有效",
  });
}
