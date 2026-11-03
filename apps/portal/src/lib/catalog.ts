import fs from "node:fs";
import path from "node:path";

export type ToolStatus = "available" | "coming_soon";

export type ToolCard = {
  id: string;
  name: string;
  summary: string;
  categories?: string[];
  tags?: string[];
  status?: ToolStatus;
  /** In-app path. Only set when the card should link inside the portal. */
  route?: string;
  license?: string;
  author?: string;
  docsUrl?: string;
};

function catalogDir(): string {
  const candidates = [
    path.join(process.cwd(), "catalog", "tools"),
    path.join(process.cwd(), "..", "..", "catalog", "tools"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function pick(text: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const m = text.match(re);
  if (!m) return undefined;
  const v = m[1].trim();
  if (v === "|" || v === ">" || v === "") return undefined;
  return v;
}

function pickList(text: string, key: string): string[] | undefined {
  const inline = text.match(new RegExp(`^${key}:\\s*\\[(.+)\\]\\s*$`, "m"));
  if (inline) {
    return inline[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function pickDocs(text: string): string | undefined {
  const m = text.match(/^\s+docs:\s+(\S+)/m);
  return m?.[1];
}

function pickStatus(text: string): ToolStatus | undefined {
  const v = pick(text, "status");
  if (v === "available" || v === "coming_soon") return v;
  return undefined;
}

function pickRoute(text: string): string | undefined {
  const v = pick(text, "route");
  if (!v) return undefined;
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("..") || /\s/.test(v)) return undefined;
  return v;
}

export function loadToolCards(): ToolCard[] {
  const dir = catalogDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      return {
        id: pick(raw, "id") ?? file.replace(/\.ya?ml$/, ""),
        name: pick(raw, "name") ?? file,
        summary: pick(raw, "summary") ?? "",
        categories: pickList(raw, "categories"),
        tags: pickList(raw, "tags"),
        status: pickStatus(raw),
        route: pickRoute(raw),
        license: pick(raw, "license"),
        author: pick(raw, "author"),
        docsUrl: pickDocs(raw),
      } satisfies ToolCard;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
