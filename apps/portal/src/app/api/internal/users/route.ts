import { NextResponse } from "next/server";
import { assertInternal } from "@/lib/internal-auth";
import {
  listUsers,
  publicUser,
  pendingCode,
  membershipStatus,
  setMembership,
  revokeDevice,
} from "@/lib/user-store";
import { authFailure } from "@/lib/auth/http";
export async function GET(request: Request) {
  if (!assertInternal(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const users = await Promise.all(
      (await listUsers()).map(async (u) => ({
        ...publicUser(u),
        createdAt: u.createdAt,
        membershipStored: u.membership,
        liveMembership: membershipStatus(u),
        pendingVerify: !u.campusVerifiedAt,
        lastCode:
          process.env.EMAIL_DEV_ECHO === "true" && !u.campusVerifiedAt
            ? (await pendingCode(u.email, "register"))?.code
            : undefined,
      })),
    );
    return NextResponse.json({ users });
  } catch (e) {
    return authFailure(e);
  }
}
export async function POST(request: Request) {
  if (!assertInternal(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const b = await request.json().catch(() => null);
    if (typeof b?.userId !== "string")
      return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
    let user;
    if (b.action === "grant_lifetime" || b.action === "revoke_lifetime")
      user = await setMembership(b.userId, b.action === "grant_lifetime");
    else if (b.action === "revoke_device" && typeof b.deviceId === "string")
      user = await revokeDevice(b.userId, b.deviceId);
    else return NextResponse.json({ error: "unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true, user: publicUser(user) });
  } catch (e) {
    return authFailure(e);
  }
}
