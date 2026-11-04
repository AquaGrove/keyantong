import { NextResponse } from "next/server";
import { createWorker, listWorkers } from "@/lib/workers/store";
import { currentUser } from "@/lib/user-session";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const agents = await listWorkers(user.id);
  return NextResponse.json({ agents });
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`workers-create:${ip}`, { windowMs: 60_000, max: 10 });
  if (!rl.ok) return NextResponse.json({ error: "过于频繁" }, { status: 429 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let body: { name?: string; kind?: string; persona?: string; skills?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const result = await createWorker(user.id, {
    name: typeof body.name === "string" ? body.name : "",
    kind: body.kind === "pet" ? "pet" : "worker",
    persona: typeof body.persona === "string" ? body.persona : "",
    skills: Array.isArray(body.skills) ? body.skills.map(String) : [],
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ agent: result.agent });
}
