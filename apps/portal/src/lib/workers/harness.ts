import { sanitizeModelOutput, redactForModel } from "@/lib/llm/sanitize";
export function harnessConfigured() {
  return Boolean(
    process.env.HARNESS_WORKER_URL?.trim() &&
      process.env.HARNESS_WORKER_TOKEN?.trim(),
  );
}
export async function workerRuntimeStatus() {
  if (!harnessConfigured())
    return {
      engine: "gateway",
      connected: false,
      label: "基础对话 · 专属角色引擎待连接",
    };
  try {
    const r = await fetch(
      `${process.env.HARNESS_WORKER_URL!.replace(/\/$/, "")}/health`,
      {
        headers: {
          Authorization: `Bearer ${process.env.HARNESS_WORKER_TOKEN}`,
        },
        signal: AbortSignal.timeout(2500),
        cache: "no-store",
      },
    );
    return {
      engine: "deepseek-harness",
      connected: r.ok,
      label: r.ok ? "专属角色引擎已连接" : "专属角色引擎暂不可用",
    };
  } catch {
    return {
      engine: "deepseek-harness",
      connected: false,
      label: "专属角色引擎连接失败",
    };
  }
}
export async function harnessTurn(input: {
  mode?: "plan";
  userId: string;
  agentId: string;
  system: string;
  message: string;
  facts: string[];
}) {
  try {
    const res = await fetch(
      `${process.env.HARNESS_WORKER_URL!.replace(/\/$/, "")}/v1/turn`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.HARNESS_WORKER_TOKEN}`,
        },
        body: JSON.stringify({
          ...input,
          message: redactForModel(input.message),
          system: redactForModel(input.system),
          facts: input.facts.map(redactForModel),
        }),
        signal: AbortSignal.timeout(input.mode === "plan" ? 20000 : 100000),
        cache: "no-store",
      },
    );
    const data = await res.json();
    if (!res.ok)
      return {
        ok: false as const,
        error:
          typeof data.error === "string" ? data.error : "专属角色服务暂不可用",
        status: [409, 429, 503, 504].includes(res.status) ? res.status : 502,
      };
    const text = input.mode === "plan" ? String(data.reply || "").slice(0, 12000) : sanitizeModelOutput(String(data.reply || ""));
    if (!text.trim())
      return {
        ok: false as const,
        error: "专属角色未返回有效内容",
        status: 502,
      };
    return {
      ok: true as const,
      text,
      model: String(data.model || "harness"),
      tokens: Math.max(
        1,
        Number(data.usage?.totalTokens) ||
          Math.ceil((input.message.length + text.length) / 2),
      ),
      estimated: true,
    };
  } catch {
    return {
      ok: false as const,
      error: "专属角色连接失败或超时，请稍后重试",
      status: 504,
    };
  }
}
