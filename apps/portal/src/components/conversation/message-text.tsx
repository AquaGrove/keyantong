import type { ReactNode } from "react";

const messageTokens =
  /\[([^\]\n]+)\]\(([^\s)]+)\)|https?:\/\/[^\s<>"“”。，、；！？）】》]+|\*\*([^*\n]+)\*\*|(?<![a-zA-Z0-9_])(?:RNA[ -]?seq|BSA[ -]?seq|GWAS|NCBI|SRA|FASTQ|FASTA|VCF|GFF3?|GTF|DOI|BLAST|RAG|TPM|FPKM)(?![a-zA-Z0-9_])|(?:基因型剂量|基因表达矩阵|表达矩阵|差异表达|参考基因组|群体结构|显著性阈值|全基因组关联分析|多重检验)/giu;

function safeLink(value: string) {
  if (/[\\\s\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password)
      return url.href;
  } catch {
    return null;
  }
  return null;
}

export function MessageText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const token of text.matchAll(messageTokens)) {
    const [value, label, destination, emphasis] = token;
    const index = token.index;
    parts.push(text.slice(offset, index));
    if (label || /^https?:\/\//i.test(value)) {
      let rawUrl = destination || value.replace(/[.,;!?\]}]+$/u, "");
      if (!destination && rawUrl.endsWith(")") && !rawUrl.includes("("))
        rawUrl = rawUrl.replace(/\)+$/, "");
      const href = safeLink(rawUrl);
      if (href) {
        const external = !href.startsWith("/");
        parts.push(
          <a
            className="conversation-message-link"
            key={index}
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
          >
            {label || rawUrl}
          </a>,
        );
        if (!label) parts.push(value.slice(rawUrl.length));
      } else {
        parts.push(value);
      }
    } else {
      parts.push(
        <strong className="conversation-message-term" key={index}>
          {emphasis || value}
        </strong>,
      );
    }
    offset = index + value.length;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}
