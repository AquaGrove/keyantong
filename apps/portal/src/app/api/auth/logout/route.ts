import { cookies } from "next/headers";
import { authUsesPostgres } from "@/lib/db/pool";
import { revokeSession } from "@/lib/auth/postgres";
import { NextResponse } from "next/server";
import { currentUser, USER_COOKIE } from "@/lib/user-session";

export async function POST(request: Request) {
  const expected = request.headers.get("x-keyantong-actor");
  if (expected && expected !== (await currentUser())?.id)
    return NextResponse.json({ error: "登录会话已变化" }, { status: 409 });
  if (authUsesPostgres())
    await revokeSession((await cookies()).get(USER_COOKIE)?.value);
  const res = expected
    ? NextResponse.json({ ok: true })
    : NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(USER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
