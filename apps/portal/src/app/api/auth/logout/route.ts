import { NextResponse } from "next/server";
import { USER_COOKIE } from "@/lib/user-session";

export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/", request.url), 303);
  res.cookies.set(USER_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
