import type { LlmTier } from "./config";
export type { LlmTier };

/** User points = ceil(tokens * coefficient). Supplier ledger keeps raw tokens. */
export const TIER_COEFFICIENT: Record<LlmTier, number> = {
  fast: 1.0,
  default: 1.5,
  reasoning: 3.0,
};

export type AiScene =
  | "faq"
  | "chat"
  | "tool_help"
  | "rag_draft"
  | "deep_troubleshoot";

export function sceneToTier(scene: string | undefined): LlmTier {
  switch ((scene || "chat").trim()) {
    case "faq":
    case "chat":
      return "fast";
    case "deep_troubleshoot":
      return "reasoning";
    case "tool_help":
    case "rag_draft":
    default:
      return "default";
  }
}

export function maxTokensForScene(scene: string | undefined): number {
  switch ((scene || "chat").trim()) {
    case "faq":
    case "chat":
      return 600;
    case "tool_help":
    case "rag_draft":
      return 1200;
    case "deep_troubleshoot":
      return 2000;
    default:
      return 800;
  }
}

/** Soft daily cap for expensive reasoning calls (in addition to token budget). */
export const REASONING_DAILY_CALL_CAP = 10;

/**
 * Allowed model id prefixes (case-sensitive where vendors use it).
 * Blocks embedding / image / speech ids when ops misconfigure.
 */
export const MODEL_PREFIX_WHITELIST = [
  "deepseek-",
  "DeepSeek-",
  "DeepSeek/",
  "deepseek/",
  "Qwen/",
  "Qwen2",
  "qwen",
  "THUDM/",
  "Pro/",
  "tencent/",
  "moonshotai/",
  "MiniMaxAI/",
  "01-ai/",
  "glm-",
  "GLM-",
  "gpt-", // OpenAI-compatible proxies
  "o1",
  "o3",
  "claude-",
];

export function isModelAllowed(model: string, allowAny: boolean): boolean {
  if (allowAny) return true;
  const m = model.trim();
  if (!m || m.length > 128) return false;
  const lower = m.toLowerCase();
  if (
    lower.includes("embed") ||
    lower.includes("rerank") ||
    lower.includes("whisper") ||
    lower.includes("tts") ||
    lower.includes("dall-e") ||
    lower.includes("stable-diffusion") ||
    lower.includes("image")
  ) {
    return false;
  }
  return MODEL_PREFIX_WHITELIST.some((p) => m.startsWith(p) || lower.startsWith(p.toLowerCase()));
}

export function pointsFromTokens(tokens: number, tier: LlmTier): number {
  const k = TIER_COEFFICIENT[tier] ?? 1.5;
  return Math.max(1, Math.ceil(Math.max(0, tokens) * k));
}
