import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/campus";
import { verifyPassword } from "@/lib/crypto-user";
import {
  MAX_DEVICES,
  activeDevices,
  getUserByEmail,
  upsertUser,
} from "@/lib/user-store";
import {
  DEVICE_COOKIE,
  USER_COOKIE,
  createUserToken,
  sessionCookieOptions,
} from "@/lib/user-session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
    deviceId?: string;
    deviceLabel?: string;
    replaceOldest?: boolean;
  } | null;
  const email = normalizeEmail(body?.email || "");
  const user = getUserByEmail(email);
  if (!user || !(await verifyPassword(body?.password || "", user.passwordHash))) {
    return NextResponse.json({ ok: false, error: "邮箱或密码错误" }, { status: 401 });
  }
  if (!user.campusVerifiedAt) {
    return NextResponse.json(
      { ok: false, error: "请先完成校园邮箱验证", needVerify: true },
      { status: 403 },
    );
  }

  const deviceId = (body?.deviceId || "").trim() || crypto.randomUUID();
  const label = (body?.deviceLabel || "browser").slice(0, 80);
  const now = new Date().toISOString();
  let device = user.devices.find((d) => d.id === deviceId);
  const actives = activeDevices(user);

  if (!device) {
    if (actives.length >= MAX_DEVICES && !body?.replaceOldest) {
      return NextResponse.json(
        {
          ok: false,
          error: `该账号已在 ${MAX_DEVICES} 台设备登录。可注销最旧设备后继续。`,
          code: "DEVICE_LIMIT",
          devices: actives,
        },
        { status: 409 },
      );
    }
    if (actives.length >= MAX_DEVICES && body?.replaceOldest) {
      const oldest = [...actives].sort((a, b) => a.lastSeen.localeCompare(b.lastSeen))[0];
      const slot = user.devices.find((d) => d.id === oldest.id);
      if (slot) slot.revoked = true;
    }
    device = { id: deviceId, label, lastSeen: now, revoked: false };
    user.devices.push(device);
  } else {
    if (device.revoked) {
      if (activeDevices(user).length >= MAX_DEVICES && !body?.replaceOldest) {
        return NextResponse.json(
          {
            ok: false,
            error: "该设备已被注销，且有效设备已满",
            code: "DEVICE_LIMIT",
            devices: activeDevices(user),
          },
          { status: 409 },
        );
      }
      device.revoked = false;
    }
    device.lastSeen = now;
    device.label = label;
  }
  upsertUser(user);

  const token = await createUserToken(user.id);
  const res = NextResponse.json({ ok: true, deviceId });
  res.cookies.set(USER_COOKIE, token, sessionCookieOptions());
  res.cookies.set(DEVICE_COOKIE, deviceId, { ...sessionCookieOptions(), httpOnly: false });
  return res;
}
