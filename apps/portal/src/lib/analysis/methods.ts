import manifest from "../../../../../catalog/analysis/methods.json";
import prior from "../../../../../catalog/analysis/research-adapters.json";
type Parameter = {
  default: number;
  min: number;
  max: number;
  integer: boolean;
};
export type AnalysisMethod = {
  id: string;
  module: string;
  name: string;
  version: string;
  status: string;
  files: string[];
  inputs: string;
  outputs: string;
  limitations: string;
  parameters: Record<string, Parameter>;
};
export const METHODS = manifest.methods as unknown as AnalysisMethod[];
export const RESEARCH_ADAPTERS = prior;
export const ENVIRONMENT = {
  image: "keyantong-omics:20261105",
  scope: "CPU · 有界任务",
  software: [
    "PLINK 1.9",
    "SAMtools / BCFtools / BEDTools / VCFtools / tabix",
    "BWA / minimap2 / HISAT2 / STAR / Salmon / Subread",
    "fastp / FastQC / MultiQC",
    "R · DESeq2 / edgeR / limma",
    "Python · NumPy / pandas / SciPy / matplotlib / PyDESeq2",
    "BLAST+ / MAFFT / IQ-TREE / SeqKit",
  ],
};
export function validateConfig(method: string, raw: Record<string, unknown>) {
  const descriptor = METHODS.find((m) => m.id === method);
  if (!descriptor) throw new Error("分析方法尚未开放执行");
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("分析参数必须为对象");
  if (Object.keys(raw).some((k) => !Object.hasOwn(descriptor.parameters, k)))
    throw new Error("包含当前算法不支持的参数");
  const result: Record<string, number> = {};
  for (const [key, spec] of Object.entries(descriptor.parameters)) {
    if (raw[key] !== undefined && typeof raw[key] !== "number")
      throw new Error("参数必须为数值：" + key);
    const v = raw[key] === undefined ? spec.default : Number(raw[key]);
    if (
      !Number.isFinite(v) ||
      v < spec.min ||
      v > spec.max ||
      (spec.integer && !Number.isInteger(v))
    )
      throw new Error(
        key === "ploidy"
          ? "当前方法仅支持二倍体；多倍体须选择独立验证的适配器"
          : "参数超出允许范围：" + key,
      );
    result[key] = v;
  }
  return result;
}
