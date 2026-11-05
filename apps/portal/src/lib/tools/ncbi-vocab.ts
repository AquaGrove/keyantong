/**
 * NCBI / INSDC SRA & BioProject controlled vocabularies (common production sets).
 * Not exhaustive of every historical alias; UI always offers「其他」free-text fallback.
 * Refs: NCBI SRA Metadata, BioProject data type list, BioSample organism free-text.
 */

export type VocabOption = { value: string; label?: string; group?: string };

export const BIOPROJECT_DATA_TYPES: VocabOption[] = [
  { value: "genome sequencing", label: "genome sequencing（基因组测序）", group: "常见" },
  { value: "transcriptome", label: "transcriptome（转录组）", group: "常见" },
  { value: "exome", label: "exome（外显子组）", group: "常见" },
  { value: "metagenome", label: "metagenome（宏基因组）", group: "常见" },
  { value: "epigenomics", label: "epigenomics（表观组）", group: "常见" },
  { value: "variation", label: "variation（变异）", group: "常见" },
  { value: "proteome", label: "proteome（蛋白质组）", group: "其他类型" },
  { value: "phenotype or genotype", label: "phenotype or genotype", group: "其他类型" },
  { value: "map", label: "map（图谱）", group: "其他类型" },
  { value: "haplotype map", label: "haplotype map", group: "其他类型" },
  { value: "clone ends", label: "clone ends", group: "其他类型" },
  { value: "targeted loci", label: "targeted loci（靶向位点）", group: "其他类型" },
  { value: "random survey", label: "random survey", group: "其他类型" },
  { value: "assembly", label: "assembly（组装）", group: "其他类型" },
  { value: "other", label: "other（其他）", group: "其他类型" },
];

/** INSDC / NCBI SRA library_strategy */
export const LIBRARY_STRATEGIES: VocabOption[] = [
  { value: "WGS", group: "基因组 / 重测序" },
  { value: "WGA", group: "基因组 / 重测序" },
  { value: "WXS", group: "基因组 / 重测序" },
  { value: "WCS", group: "基因组 / 重测序" },
  { value: "Clone", group: "基因组 / 重测序" },
  { value: "Poolclone", group: "基因组 / 重测序" },
  { value: "Clone-end", group: "基因组 / 重测序" },
  { value: "finishing", group: "基因组 / 重测序" },
  { value: "Amplicon", group: "基因组 / 重测序" },
  { value: "Targeted-Capture", group: "基因组 / 重测序" },
  { value: "Synthetic-Long-Read", group: "基因组 / 重测序" },
  { value: "RAD-Seq", group: "基因组 / 重测序" },
  { value: "GBS", group: "基因组 / 重测序" },
  { value: "RNA-Seq", group: "转录组 / RNA" },
  { value: "ssRNA-seq", group: "转录组 / RNA" },
  { value: "miRNA-Seq", group: "转录组 / RNA" },
  { value: "ncRNA-Seq", group: "转录组 / RNA" },
  { value: "FL-cDNA", group: "转录组 / RNA" },
  { value: "EST", group: "转录组 / RNA" },
  { value: "RIP-Seq", group: "转录组 / RNA" },
  { value: "ChIRP-Seq", group: "转录组 / RNA" },
  { value: "ChIP-Seq", group: "表观 / 染色质" },
  { value: "ATAC-seq", group: "表观 / 染色质" },
  { value: "MNase-Seq", group: "表观 / 染色质" },
  { value: "DNase-Hypersensitivity", group: "表观 / 染色质" },
  { value: "FAIRE-seq", group: "表观 / 染色质" },
  { value: "Hi-C", group: "表观 / 染色质" },
  { value: "ChIA-PET", group: "表观 / 染色质" },
  { value: "Tethered Chromatin Conformation Capture", group: "表观 / 染色质" },
  { value: "Bisulfite-Seq", group: "甲基化" },
  { value: "MeDIP-Seq", group: "甲基化" },
  { value: "MRE-Seq", group: "甲基化" },
  { value: "MBD-Seq", group: "甲基化" },
  { value: "NOMe-Seq", group: "甲基化" },
  { value: "Tn-Seq", group: "功能筛选 / 其他" },
  { value: "VALIDATION", group: "功能筛选 / 其他" },
  { value: "SELEX", group: "功能筛选 / 其他" },
  { value: "CTS", group: "功能筛选 / 其他" },
  { value: "DIP-Seq", group: "功能筛选 / 其他" },
  { value: "OTHER", group: "功能筛选 / 其他" },
];

/** INSDC library_source */
export const LIBRARY_SOURCES: VocabOption[] = [
  { value: "GENOMIC", label: "GENOMIC（基因组 DNA）" },
  { value: "GENOMIC SINGLE CELL", label: "GENOMIC SINGLE CELL" },
  { value: "TRANSCRIPTOMIC", label: "TRANSCRIPTOMIC（转录组）" },
  { value: "TRANSCRIPTOMIC SINGLE CELL", label: "TRANSCRIPTOMIC SINGLE CELL" },
  { value: "METAGENOMIC", label: "METAGENOMIC（宏基因组）" },
  { value: "METATRANSCRIPTOMIC", label: "METATRANSCRIPTOMIC（宏转录组）" },
  { value: "SYNTHETIC", label: "SYNTHETIC（合成）" },
  { value: "VIRAL RNA", label: "VIRAL RNA" },
  { value: "OTHER", label: "OTHER" },
];

/** INSDC library_selection */
export const LIBRARY_SELECTIONS: VocabOption[] = [
  { value: "RANDOM", group: "通用" },
  { value: "PCR", group: "通用" },
  { value: "RANDOM PCR", group: "通用" },
  { value: "RT-PCR", group: "通用" },
  { value: "HMPR", group: "通用" },
  { value: "MF", group: "通用" },
  { value: "CF-S", group: "通用" },
  { value: "CF-M", group: "通用" },
  { value: "CF-H", group: "通用" },
  { value: "CF-T", group: "通用" },
  { value: "MDA", group: "通用" },
  { value: "MSLL", group: "通用" },
  { value: "cDNA", group: "RNA / cDNA" },
  { value: "cDNA_oligo_dT", group: "RNA / cDNA" },
  { value: "cDNA_randomPriming", group: "RNA / cDNA" },
  { value: "Oligo-dT", group: "RNA / cDNA" },
  { value: "PolyA", group: "RNA / cDNA" },
  { value: "Inverse rRNA", group: "RNA / cDNA" },
  { value: "CAGE", group: "RNA / cDNA" },
  { value: "RACE", group: "RNA / cDNA" },
  { value: "ChIP", group: "表观 / 富集" },
  { value: "MNase", group: "表观 / 富集" },
  { value: "DNAse", group: "表观 / 富集" },
  { value: "Hybrid Selection", group: "表观 / 富集" },
  { value: "Reduced Representation", group: "表观 / 富集" },
  { value: "Restriction Digest", group: "表观 / 富集" },
  { value: "5-methylcytidine antibody", group: "表观 / 富集" },
  { value: "MBD2 protein methyl-CpG binding domain", group: "表观 / 富集" },
  { value: "Padlock probes capture method", group: "表观 / 富集" },
  { value: "size fractionation", group: "其他" },
  { value: "unspecified", group: "其他" },
  { value: "other", group: "其他" },
];

export const LIBRARY_LAYOUTS: VocabOption[] = [
  { value: "paired", label: "paired（双端）" },
  { value: "single", label: "single（单端）" },
];

/** Common research organisms (scientific name). Free text always allowed. */
export const COMMON_ORGANISMS: VocabOption[] = [
  { value: "Homo sapiens", label: "Homo sapiens（人）", group: "动物 / 模式" },
  { value: "Mus musculus", label: "Mus musculus（小鼠）", group: "动物 / 模式" },
  { value: "Rattus norvegicus", label: "Rattus norvegicus（大鼠）", group: "动物 / 模式" },
  { value: "Danio rerio", label: "Danio rerio（斑马鱼）", group: "动物 / 模式" },
  { value: "Drosophila melanogaster", label: "Drosophila melanogaster（果蝇）", group: "动物 / 模式" },
  { value: "Caenorhabditis elegans", label: "Caenorhabditis elegans（线虫）", group: "动物 / 模式" },
  { value: "Gallus gallus", label: "Gallus gallus（鸡）", group: "动物 / 模式" },
  { value: "Sus scrofa", label: "Sus scrofa（猪）", group: "动物 / 模式" },
  { value: "Bos taurus", label: "Bos taurus（牛）", group: "动物 / 模式" },
  { value: "Arabidopsis thaliana", label: "Arabidopsis thaliana（拟南芥）", group: "植物" },
  { value: "Oryza sativa", label: "Oryza sativa（水稻）", group: "植物" },
  { value: "Zea mays", label: "Zea mays（玉米）", group: "植物" },
  { value: "Triticum aestivum", label: "Triticum aestivum（小麦）", group: "植物" },
  { value: "Glycine max", label: "Glycine max（大豆）", group: "植物" },
  { value: "Solanum lycopersicum", label: "Solanum lycopersicum（番茄）", group: "植物" },
  { value: "Solanum tuberosum", label: "Solanum tuberosum（马铃薯）", group: "植物" },
  { value: "Nicotiana tabacum", label: "Nicotiana tabacum（烟草）", group: "植物" },
  { value: "Populus trichocarpa", label: "Populus trichocarpa（杨树）", group: "植物" },
  { value: "Saccharomyces cerevisiae", label: "Saccharomyces cerevisiae（酵母）", group: "微生物" },
  { value: "Schizosaccharomyces pombe", label: "Schizosaccharomyces pombe", group: "微生物" },
  { value: "Escherichia coli", label: "Escherichia coli", group: "微生物" },
  { value: "Bacillus subtilis", label: "Bacillus subtilis", group: "微生物" },
  { value: "Pseudomonas aeruginosa", label: "Pseudomonas aeruginosa", group: "微生物" },
  { value: "Staphylococcus aureus", label: "Staphylococcus aureus", group: "微生物" },
  { value: "metagenome", label: "metagenome（宏基因组混合样本）", group: "特殊" },
  { value: "synthetic construct", label: "synthetic construct", group: "特殊" },
];

/** Sensible defaults when BioProject data type changes. */
export function suggestLibraryForDataType(dataType: string): {
  strategy: string;
  source: string;
  selection: string;
} | null {
  const t = dataType.toLowerCase();
  if (t.includes("transcript")) {
    return { strategy: "RNA-Seq", source: "TRANSCRIPTOMIC", selection: "cDNA" };
  }
  if (t.includes("exome")) {
    return { strategy: "WXS", source: "GENOMIC", selection: "Hybrid Selection" };
  }
  if (t.includes("epigen")) {
    return { strategy: "ChIP-Seq", source: "GENOMIC", selection: "ChIP" };
  }
  if (t.includes("metagenome")) {
    return { strategy: "WGS", source: "METAGENOMIC", selection: "RANDOM" };
  }
  if (t.includes("genome")) {
    return { strategy: "WGS", source: "GENOMIC", selection: "RANDOM" };
  }
  if (t.includes("variation")) {
    return { strategy: "WGS", source: "GENOMIC", selection: "RANDOM" };
  }
  return null;
}

export const OTHER_VALUE = "__other__";
