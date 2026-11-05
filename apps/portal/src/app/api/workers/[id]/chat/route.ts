import { NextResponse } from "next/server";
import { detectIntent, planForIntent, renderPlan } from "@/lib/dispatch/intent";
import {
  appendMemory,
  buildWorkerSystemPrompt,
  getWorker,
  readMemory,
} from "@/lib/workers/store";
import { harnessConfigured, harnessTurn } from "@/lib/workers/harness";
import { llmChat } from "@/lib/llm/client";
import { getLlmConfig } from "@/lib/llm/config";
import {
  REASONING_DAILY_CALL_CAP,
  TIER_COEFFICIENT,
  sceneToTier,
} from "@/lib/llm/models";
import { assertWithinQuota, commitUsage, readQuota } from "@/lib/llm/quota";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { currentUser } from "@/lib/user-session";
import { isEntitled } from "@/lib/user-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function POST(request: Request, ctx: Ctx) {
  const rl = rateLimit(`worker-chat:${clientIp(request)}`, {
    windowMs: 60000,
    max: 30,
  });
  if (!rl.ok)
    return NextResponse.json(
      { error: "请求过于频繁，请稍后重试" },
      { status: 429 },
    );
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user))
    return NextResponse.json(
      {
        error:
          "智能角色对话需要有效校园试用或永久会员；论坛分享与响应仍然开放。",
      },
      { status: 403 },
    );
  const { id } = await ctx.params;
  const agent = await getWorker(user.id, id);
  if (!agent)
    return NextResponse.json({ error: "未找到该角色" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.message !== "string" ||
    !body.message.trim() ||
    body.message.length > 4000
  )
    return NextResponse.json(
      { error: "请输入 1–4000 字的消息" },
      { status: 400 },
    );
  const message = body.message.trim();
  const locale = body.locale === "en" ? "en" : "zh";
  const intent = detectIntent(message);
  const plan = renderPlan(planForIntent(intent), locale);
  const cfg = getLlmConfig();
  const tier = sceneToTier("tool_help");
  const budget = {
    pointsBudget: Math.ceil(cfg.dailyTokenBudget * TIER_COEFFICIENT.default),
    callsBudget: cfg.dailyCallBudget,
    reasoningCap: REASONING_DAILY_CALL_CAP,
  };
  const gate = await assertWithinQuota(user.id, tier, budget);
  if (!gate.ok)
    return NextResponse.json(
      { error: "今日助手额度已用完", quota: gate.snapshot },
      { status: 429 },
    );
  const memory = await readMemory(user.id, id);
  const system = `${buildWorkerSystemPrompt(agent, memory)}\n用户语言：${locale}。先根据用户的研究目标与历史提供个性化思路和步骤，不要直接用固定清单替代回答。工具入口仅供用户自行打开，不得声称已经运行分析、发布帖子或完成外部操作。`;
  const facts =
    intent === "general"
      ? []
      : [
          `platform_module=${plan.title}`,
          `module_description=${plan.body}`,
          `preparation=${plan.checklist.join("; ")}`,
          `next_url=${plan.next?.href || ""}`,
        ];
  const useHarness = harnessConfigured();
  const result = useHarness
    ? await harnessTurn({
        userId: user.id,
        agentId: id,
        system,
        message,
        facts,
      })
    : await llmChat({
        scene: "tool_help",
        message,
        facts,
        systemExtra: system,
        history: memory.messages
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content })),
      });
  if (!result.ok)
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  const tokens = "tokens" in result ? result.tokens : result.usage.totalTokens;
  await commitUsage({
    userId: user.id,
    tier,
    tokens,
    reasoningCap: REASONING_DAILY_CALL_CAP,
  });
  const mem = await appendMemory(user.id, id, message, result.text);
  return NextResponse.json({
    reply: result.text,
    intent,
    next: intent === "general" ? null : plan.next,
    source: useHarness ? "deepseek-harness" : "llm-gateway",
    agent: { id: agent.id, name: agent.name, kind: agent.kind },
    memory: { summary: mem.summary, messages: mem.messages },
    model: result.model,
    usageEstimated:
      "estimated" in result ? result.estimated : result.usage.estimated,
    quota: await readQuota(user.id, budget),
  });
}
