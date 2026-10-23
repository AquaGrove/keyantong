import { NextResponse } from "next/server";
import { assertInternal } from "@/lib/internal-auth";
import {
  getUserById,
  listUsers,
  membershipStatus,
  peekCode,
  publicUser,
  upsertUser,
} from "@/lib/user-store";

export async function GET(request: Request) {
  if (!assertInternal(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const users = listUsers().map((u) => ({
    ...publicUser(u),
    createdAt: u.createdAt,
    membershipStored: u.membership,
    liveMembership: membershipStatus(u),
    pendingVerify: !u.campusVerifiedAt,
    lastCode:
      process.env.EMAIL_DEV_ECHO === "true" && !u.campusVerifiedAt
        ? peekCode(u.email, "register")?.code
        : undefined,
  }));
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  if (!assertInternal(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    action?: "grant_lifetime" | "revoke_lifetime" | "revoke_device";
    deviceId?: string;
  } | null;
  const user = body?.userId ? getUserById(body.userId) : undefined;
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  if (body?.action === "grant_lifetime") {
    user.membership = "lifetime";
    user.lifetimeGrantedAt = new Date().toISOString();
  } else if (body?.action === "revoke_lifetime") {
    user.membership = "expired";
    user.lifetimeGrantedAt = null;
  } else if (body?.action === "revoke_device" && body.deviceId) {
    const d = user.devices.find((x) => x.id === body.deviceId);
    if (d) d.revoked = true;
  } else {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  upsertUser(user);
  return NextResponse.json({ ok: true, user: publicUser(user) });
}
