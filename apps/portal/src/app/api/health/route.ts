import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { authUsesPostgres, dbPool } = await import("@/lib/db/pool");
    if (authUsesPostgres())
      await dbPool("auth").query("SELECT id FROM kt_auth.users LIMIT 1");
    return NextResponse.json({
      ok: true,
      service: "portal",
      identity: authUsesPostgres() ? "postgres" : "json",
    });
  } catch {
    return NextResponse.json({ ok: false, service: "portal" }, { status: 503 });
  }
}
