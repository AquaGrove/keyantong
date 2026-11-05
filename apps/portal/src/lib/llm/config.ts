/** Server-only LLM env. Never import from Client Components. */

export type LlmTier = "fast" | "default" | "reasoning";

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  configured: boolean;
  models: Record<LlmTier, string>;
  dailyTokenBudget: number;
  dailyCallBudget: number;
  timeoutMs: number;
  allowAnyModel: boolean;
};

function trimSlash(u: string) {
  return u.replace(/\/+$/, "");
}

export function getLlmConfig(): LlmConfig {
  const apiKey = (process.env.LLM_API_KEY || "").trim();
  const baseUrl = trimSlash(
    (process.env.LLM_BASE_URL || "https://api.deepseek.com/v1").trim(),
  );
  const def = (process.env.LLM_MODEL || "deepseek-chat").trim();
  return {
    baseUrl,
    apiKey,
    configured: Boolean(apiKey),
    models: {
      fast: (process.env.LLM_MODEL_FAST || def).trim(),
      default: def,
      reasoning: (process.env.LLM_MODEL_REASONING || "deepseek-reasoner").trim(),
    },
    dailyTokenBudget: Math.max(
      1000,
      Number(process.env.LLM_DAILY_TOKEN_BUDGET || 200_000) || 200_000,
    ),
    dailyCallBudget: Math.max(1, Number(process.env.LLM_DAILY_CALL_BUDGET || 80) || 80),
    timeoutMs: Math.min(
      120_000,
      Math.max(5_000, Number(process.env.LLM_TIMEOUT_MS || 45_000) || 45_000),
    ),
    allowAnyModel: process.env.LLM_ALLOW_ANY_MODEL === "1",
  };
}

export function publicLlmStatus(cfg: LlmConfig = getLlmConfig()) {
  return {
    configured: cfg.configured,
    baseUrlHost: (() => {
      try {
        return new URL(cfg.baseUrl).host;
      } catch {
        return "invalid";
      }
    })(),
    models: { ...cfg.models },
    dailyTokenBudget: cfg.dailyTokenBudget,
    dailyCallBudget: cfg.dailyCallBudget,
    // never expose apiKey
  };
}
