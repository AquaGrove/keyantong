import fs from "node:fs";
import path from "node:path";

export type ToolCard = {
  id: string;
  name: string;
  summary: string;
  categories?: string[];
  license?: string;
  author?: string;
  docsUrl?: string;
  portalPath?: string;
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

function pickPortal(text: string): string | undefined {
  const m = text.match(/^\s+portal:\s+(\S+)/m);
  return m?.[1];
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
        license: pick(raw, "license"),
        author: pick(raw, "author"),
        docsUrl: pickDocs(raw),
        portalPath: pickPortal(raw),
      } satisfies ToolCard;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
