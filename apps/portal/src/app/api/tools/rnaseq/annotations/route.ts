import { NextResponse } from "next/server";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import { annotationsHelp, listSpeciesStatus, seedDemoTryout } from "@/lib/tools/rnaseq-annotations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }
  return NextResponse.json({
    species: listSpeciesStatus(),
    help: annotationsHelp(),
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }
  let action = "seed-demo-tryout";
  try {
    const body = (await request.json()) as { action?: string };
    if (body?.action) action = String(body.action);
  } catch {
    // empty body ok
  }
  if (action !== "seed-demo-tryout") {
    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
  }
  const result = seedDemoTryout();
  return NextResponse.json(
    {
      ...result,
      species: listSpeciesStatus(),
      help: annotationsHelp(),
    },
    { status: result.ok ? 200 : 500 },
  );
}
