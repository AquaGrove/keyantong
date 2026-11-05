import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { isEntitled } from "@/lib/user-store";
import { getLlmConfig, publicLlmStatus } from "@/lib/llm/config";
import { REASONING_DAILY_CALL_CAP, TIER_COEFFICIENT } from "@/lib/llm/models";
import { readQuota } from "@/lib/llm/quota";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`ai-status:${ip}`, { windowMs: 60_000, max: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const cfg = getLlmConfig();
  const status = publicLlmStatus(cfg);
  const entitled = isEntitled(user);

  // Convert token budget → approximate point budget using default tier coeff
  const pointsBudget = Math.ceil(cfg.dailyTokenBudget * TIER_COEFFICIENT.default);
  const quota = entitled
    ? await readQuota(user.id, {
        pointsBudget,
        callsBudget: cfg.dailyCallBudget,
        reasoningCap: REASONING_DAILY_CALL_CAP,
      })
    : null;

  return NextResponse.json({
    ...status,
    entitled,
    coefficients: TIER_COEFFICIENT,
    pointsBudget,
    quota,
    // explicit: no secrets
    apiKeyConfigured: status.configured,
  });
}
