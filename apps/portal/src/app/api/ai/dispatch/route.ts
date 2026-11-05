import { NextResponse } from "next/server";
import { detectIntent, planForIntent, renderPlan } from "@/lib/dispatch/intent";
import { llmChat } from "@/lib/llm/client";
import { getLlmConfig } from "@/lib/llm/config";
import { TIER_COEFFICIENT, sceneToTier, REASONING_DAILY_CALL_CAP } from "@/lib/llm/models";
import { assertWithinQuota, commitUsage, readQuota } from "@/lib/llm/quota";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { currentUser } from "@/lib/user-session";
import { isEntitled } from "@/lib/user-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  message?: string;
  locale?: string;
  enhance?: boolean;
};

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`ai-dispatch:${ip}`, { windowMs: 60_000, max: 40 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
  if (message.length > 2000) {
    return NextResponse.json({ error: "消息过长" }, { status: 400 });
  }

  const locale = body.locale === "en" ? "en" : "zh";
  const intent = detectIntent(message);
  const plan = planForIntent(intent);
  const rendered = renderPlan(plan, locale);

  const user = await currentUser();
  const entitled = user ? isEntitled(user) : false;
  const wantEnhance = Boolean(body.enhance) && entitled;
  let enhanced: string | null = null;
  let quota = null as Awaited<ReturnType<typeof readQuota>> | null;
  let model: string | undefined;

  if (wantEnhance) {
    const cfg = getLlmConfig();
    if (cfg.configured && user) {
      const tier = sceneToTier("tool_help");
      const pointsBudget = Math.ceil(cfg.dailyTokenBudget * TIER_COEFFICIENT.default);
      const gate = await assertWithinQuota(user.id, tier, {
        pointsBudget,
        callsBudget: cfg.dailyCallBudget,
        reasoningCap: REASONING_DAILY_CALL_CAP,
      });
      if (gate.ok) {
        const userRl = rateLimit(`ai-dispatch-user:${user.id}`, { windowMs: 60_000, max: 20 });
        if (userRl.ok) {
          const facts = [
            `intent=${intent}`,
            `title=${rendered.title}`,
            ...rendered.checklist.map((c, i) => `checklist_${i + 1}=${c}`),
            rendered.next ? `next_href=${rendered.next.href}` : "next_href=",
            "rule=home_dispatcher_v1",
          ];
          const result = await llmChat({
            scene: "tool_help",
            message,
            facts,
          });
          if (result.ok) {
            enhanced = result.text;
            model = result.model;
            await commitUsage({
              userId: user.id,
              tier: result.tier,
              tokens: result.usage.totalTokens,
              reasoningCap: REASONING_DAILY_CALL_CAP,
            });
            quota = await readQuota(user.id, {
              pointsBudget,
              callsBudget: cfg.dailyCallBudget,
              reasoningCap: REASONING_DAILY_CALL_CAP,
            });
          }
        }
      }
    }
  }

  const replyParts = [
    `**${rendered.title}**`,
    rendered.body,
    "",
    ...(locale === "zh" ? ["请准备："] : ["Please prepare:"]),
    ...rendered.checklist.map((c, i) => `${i + 1}. ${c}`),
  ];
  if (enhanced) {
    replyParts.push("", locale === "zh" ? "—— 补充说明 ——" : "—— Extra notes ——", enhanced);
  }

  return NextResponse.json({
    intent,
    reply: replyParts.join("\n"),
    checklist: rendered.checklist,
    next: rendered.next
      ? {
          href: rendered.next.href,
          label: rendered.next.label,
        }
      : null,
    source: enhanced ? "rules+llm" : "rules",
    authenticated: Boolean(user),
    entitled,
    model,
    quota,
  });
}
