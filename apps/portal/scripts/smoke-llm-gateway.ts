/**
 * Offline smoke for LLM helpers (no vendor call required).
 *   cd apps/portal && npx tsx scripts/smoke-llm-gateway.ts
 */
import { sceneToTier, pointsFromTokens, isModelAllowed, TIER_COEFFICIENT } from "../src/lib/llm/models";
import { redactForModel, sanitizeModelOutput } from "../src/lib/llm/sanitize";
import { publicLlmStatus, getLlmConfig } from "../src/lib/llm/config";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(sceneToTier("faq") === "fast", "faq→fast");
assert(sceneToTier("tool_help") === "default", "tool→default");
assert(sceneToTier("deep_troubleshoot") === "reasoning", "deep→reasoning");
assert(pointsFromTokens(100, "fast") === 100, "k=1");
assert(pointsFromTokens(100, "default") === 150, "k=1.5");
assert(pointsFromTokens(100, "reasoning") === 300, "k=3");
assert(isModelAllowed("deepseek-chat", false), "allow deepseek");
assert(!isModelAllowed("text-embedding-3-small", false), "block embed");
assert(redactForModel("call me 13812345678 please").includes("[REDACTED_PHONE]"), "phone");
assert(!sanitizeModelOutput("leak sk-abcdefghijklmnopqrstuvwxyz1234").includes("sk-abcdefghijklmnop"), "sk redacted");

const st = publicLlmStatus(getLlmConfig());
assert(!("apiKey" in st), "no apiKey field");
assert(typeof st.configured === "boolean", "configured bool");
assert(TIER_COEFFICIENT.default === 1.5, "coeff");

console.log("smoke-llm-gateway: OK", st);
