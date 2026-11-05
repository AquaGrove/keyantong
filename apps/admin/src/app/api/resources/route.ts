import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/auth";
import { portalFetch } from "@/lib/portal-internal";
async function allowed() {
  return verifySessionToken((await cookies()).get(ADMIN_COOKIE)?.value);
}
export async function GET() {
  if (!(await allowed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await portalFetch("/api/internal/resources");
    return NextResponse.json(await r.json(), { status: r.status });
  } catch {
    return NextResponse.json({ error: "门户审核服务不可用" }, { status: 502 });
  }
}
export async function POST(request: Request) {
  if (!(await allowed()))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.text();
    if (body.length > 5000)
      return NextResponse.json({ error: "请求过大" }, { status: 413 });
    const r = await portalFetch("/api/internal/resources", {
      method: "POST",
      body,
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch {
    return NextResponse.json({ error: "审核保存失败" }, { status: 502 });
  }
}
