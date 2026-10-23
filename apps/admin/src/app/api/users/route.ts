import { NextResponse } from "next/server";
import { portalFetch } from "@/lib/portal-internal";

export async function GET() {
  try {
    const res = await portalFetch("/api/internal/users");
    const data = await res.json().catch(() => ({ error: "invalid json" }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "portal unreachable" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await portalFetch("/api/internal/users", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "invalid json" }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "portal unreachable" },
      { status: 502 },
    );
  }
}
