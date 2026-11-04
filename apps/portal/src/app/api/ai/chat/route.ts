import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { isEntitled } from "@/lib/user-store";
import { llmChat } from "@/lib/llm/client";
import { getLlmConfig } from "@/lib/llm/config";
import {
  REASONING_DAILY_CALL_CAP,
  TIER_COEFFICIENT,
  sceneToTier,
} from "@/lib/llm/models";
import { assertWithinQuota, commitUsage, readQuota } from "@/lib/llm/quota";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  scene?: string;
  message?: string;
  facts?: unknown;
  json?: boolean;
  model?: string;
};

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`ai-chat:${ip}`, { windowMs: 60_000, max: 20 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message : "";
  const facts = Array.isArray(body.facts)
    ? body.facts.filter((x): x is string => typeof x === "string")
    : [];
  const scene = typeof body.scene === "string" ? body.scene : "chat";
  const tier = sceneToTier(scene);

  const cfg = getLlmConfig();
  const pointsBudget = Math.ceil(cfg.dailyTokenBudget * TIER_COEFFICIENT.default);
  const gate = await assertWithinQuota(user.id, tier, {
    pointsBudget,
    callsBudget: cfg.dailyCallBudget,
    reasoningCap: REASONING_DAILY_CALL_CAP,
  });
  if (!gate.ok) {
    const msg =
      gate.code === "reasoning"
        ? "今日深度推理次数已用完"
        : gate.code === "calls"
          ? "今日调用次数已用完"
          : "今日助手点数已用完";
    return NextResponse.json(
      { error: msg, quota: gate.snapshot },
      { status: 429 },
    );
  }

  const userRl = rateLimit(`ai-chat-user:${user.id}`, { windowMs: 60_000, max: 12 });
  if (!userRl.ok) {
    return NextResponse.json(
      { error: "个人请求过于频繁" },
      { status: 429, headers: { "Retry-After": String(userRl.retryAfterSec) } },
    );
  }

  const result = await llmChat({
    scene,
    message,
    facts,
    json: Boolean(body.json),
    model: typeof body.model === "string" ? body.model : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const charged = await commitUsage({
    userId: user.id,
    tier: result.tier,
    tokens: result.usage.totalTokens,
    reasoningCap: REASONING_DAILY_CALL_CAP,
  });

  const quota = await readQuota(user.id, {
    pointsBudget,
    callsBudget: cfg.dailyCallBudget,
    reasoningCap: REASONING_DAILY_CALL_CAP,
  });

  return NextResponse.json({
    reply: result.text,
    model: result.model,
    tier: result.tier,
    coefficient: TIER_COEFFICIENT[result.tier],
    usage: result.usage,
    pointsCharged: charged.points,
    day: charged.day,
    quota,
    ...(result.rawJson !== undefined ? { json: result.rawJson } : {}),
  });
}
