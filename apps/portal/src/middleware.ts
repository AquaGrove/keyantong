import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Edge-friendly coarse checks. Fine-grained limits live in route handlers. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never expose internal APIs without secret — reject empty auth early for writes
  if (pathname.startsWith("/api/internal")) {
    const auth = request.headers.get("authorization") || "";
    const secret = request.headers.get("x-internal-secret") || "";
    if (!auth && !secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Block obvious non-browser huge bodies is not possible here; rely on host limits.
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

export const config = {
  matcher: ["/api/internal/:path*", "/api/community/:path*"],
};
