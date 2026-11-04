import { NextResponse } from "next/server";
import {
  appendMemory,
  buildWorkerSystemPrompt,
  getWorker,
  readMemory,
} from "@/lib/workers/store";
import { llmChat } from "@/lib/llm/client";
import { getLlmConfig } from "@/lib/llm/config";
import { REASONING_DAILY_CALL_CAP, TIER_COEFFICIENT, sceneToTier } from "@/lib/llm/models";
import { assertWithinQuota, commitUsage, readQuota } from "@/lib/llm/quota";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { currentUser } from "@/lib/user-session";
import { isEntitled } from "@/lib/user-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const ip = clientIp(request);
  const rl = rateLimit(`worker-chat:${ip}`, { windowMs: 60_000, max: 30 });
  if (!rl.ok) return NextResponse.json({ error: "过于频繁" }, { status: 429 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const agent = await getWorker(user.id, id);
  if (!agent) return NextResponse.json({ error: "未找到该角色" }, { status: 404 });

  let body: { message?: string };
  try {
    body = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "消息不能为空" }, { status: 400 });

  const cfg = getLlmConfig();
  const tier = sceneToTier("chat");
  const pointsBudget = Math.ceil(cfg.dailyTokenBudget * TIER_COEFFICIENT.default);
  const gate = await assertWithinQuota(user.id, tier, {
    pointsBudget,
    callsBudget: cfg.dailyCallBudget,
    reasoningCap: REASONING_DAILY_CALL_CAP,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: "今日助手额度已用完", quota: gate.snapshot }, { status: 429 });
  }

  const memory = await readMemory(user.id, id);
  const systemExtra = buildWorkerSystemPrompt(agent, memory);
  const history = memory.messages.slice(-12).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const result = await llmChat({
    scene: "chat",
    message,
    facts: [
      `worker_id=${agent.id}`,
      `worker_name=${agent.name}`,
      `worker_kind=${agent.kind}`,
    ],
    systemExtra,
    history,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await commitUsage({
    userId: user.id,
    tier: result.tier,
    tokens: result.usage.totalTokens,
    reasoningCap: REASONING_DAILY_CALL_CAP,
  });
  const mem = await appendMemory(user.id, id, message, result.text);
  const quota = await readQuota(user.id, {
    pointsBudget,
    callsBudget: cfg.dailyCallBudget,
    reasoningCap: REASONING_DAILY_CALL_CAP,
  });

  return NextResponse.json({
    reply: result.text,
    agent: { id: agent.id, name: agent.name, kind: agent.kind },
    memory: { summary: mem.summary, messages: mem.messages },
    model: result.model,
    quota,
  });
}
