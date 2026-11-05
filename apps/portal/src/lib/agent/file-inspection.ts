import { createHash } from "node:crypto";
import { harnessConfigured, harnessTurn } from "../workers/harness";
import { llmChat } from "../llm/client";
import { fileMarkers } from "./types";

const roles = ["matrix", "groups", "genotypes.csv", "phenotypes.csv", "counts.csv", "ncbi-manifest", "unassigned"];

export async function inspectFile(input: unknown, identity: string) {
  if (!input || typeof input !== "object") return null;
  const { format, columns, numeric, fractional, markers, unit, hint } = input as Record<string, unknown>;
  const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 10000 ? value : 0;
  const facts = [JSON.stringify({
    format: format === "json" ? "json" : "table",
    columns: count(columns), numeric: count(numeric), fractional: count(fractional),
    markers: Array.isArray(markers) ? fileMarkers.filter(marker => markers.includes(marker)) : [],
    unit: unit === "tpm" || unit === "fpkm" ? unit : undefined,
    hint: typeof hint === "string" && roles.includes(hint) ? hint : undefined,
  })];
  const system = "根据用户实际读取的文件结构摘要判定科研文件用途。仅输出 JSON {role}。role 允许 matrix（基因或转录本表达矩阵）、groups（样本分组）、genotypes.csv（基因型）、phenotypes.csv（性状）、counts.csv（BSA 双池计数）、ncbi-manifest、unassigned。hint 仅为提示。证据不足返回 unassigned。不能由整数推断是原始 counts。";
  const message = "请识别这个文件。";
  function read(value: unknown) {
    const role = (value as { role?: unknown } | null)?.role;
    return typeof role === "string" && roles.includes(role) ? { role } : null;
  }
  if (harnessConfigured()) {
    const result = await harnessTurn({
      mode: "plan", agentId: "portal-file-inspection-v1",
      userId: createHash("sha256").update(identity).digest("hex"), system, message, facts,
    });
    if (result.ok) {
      try {
        const parsed = read(JSON.parse(result.text.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "")));
        if (parsed) return parsed;
      } catch {}
    }
  }
  const result = await llmChat({ scene: "faq", message, facts, json: true, systemExtra: system });
  return result.ok ? read(result.rawJson) : null;
}
