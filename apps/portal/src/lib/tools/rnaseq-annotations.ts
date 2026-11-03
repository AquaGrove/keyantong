import fs from "node:fs";
import path from "node:path";

function pipelineRoot() {
  const candidates = [
    path.join(process.cwd(), "..", "..", "services", "rnaseq-pipeline"),
    path.join(process.cwd(), "services", "rnaseq-pipeline"),
    process.env.RNASEQ_PIPELINE_ROOT || "",
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "keyantong_rnaseq"))) return c;
  }
  return candidates[0];
}

export function annotationsRoot() {
  return path.join(pipelineRoot(), "annotations");
}

export type SpeciesStatus = {
  species: string;
  label: string;
  ready_go: boolean;
  ready_kegg: boolean;
  gene2go?: string | null;
  gene2kegg?: string | null;
};

const LABELS: Record<string, string> = {
  demo: "demo（内置夹具，仅试跑）",
  human: "human（需本地 annotations/human）",
  mouse: "mouse（需本地 annotations/mouse）",
  arabidopsis: "arabidopsis（需本地 annotations）",
  tryout: "tryout（demo 一键副本，试跑用）",
};

const KNOWN = ["demo", "human", "mouse", "arabidopsis", "tryout"];

export function listSpeciesStatus(): SpeciesStatus[] {
  const root = annotationsRoot();
  const rows: SpeciesStatus[] = [];
  const seen = new Set<string>();
  for (const key of KNOWN) {
    const dir = path.join(root, key);
    const go = path.join(dir, "gene2go.tsv");
    const kegg = path.join(dir, "gene2kegg.tsv");
    rows.push({
      species: key,
      label: LABELS[key] || key,
      ready_go: fs.existsSync(go),
      ready_kegg: fs.existsSync(kegg),
      gene2go: fs.existsSync(go) ? go : null,
      gene2kegg: fs.existsSync(kegg) ? kegg : null,
    });
    seen.add(key);
  }
  if (fs.existsSync(root)) {
    for (const name of fs.readdirSync(root)) {
      if (seen.has(name) || name.startsWith(".") || name === "README.md") continue;
      const dir = path.join(root, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const go = path.join(dir, "gene2go.tsv");
      const kegg = path.join(dir, "gene2kegg.tsv");
      rows.push({
        species: name,
        label: `custom:${name}`,
        ready_go: fs.existsSync(go),
        ready_kegg: fs.existsSync(kegg),
        gene2go: fs.existsSync(go) ? go : null,
        gene2kegg: fs.existsSync(kegg) ? kegg : null,
      });
    }
  }
  return rows;
}

/** Copy demo annotations into annotations/tryout for one-click try-out. */
export function seedDemoTryout(): { ok: boolean; species: string; message: string; path: string } {
  const root = annotationsRoot();
  const demo = path.join(root, "demo");
  const dest = path.join(root, "tryout");
  if (!fs.existsSync(path.join(demo, "gene2go.tsv")) || !fs.existsSync(path.join(demo, "gene2kegg.tsv"))) {
    return { ok: false, species: "tryout", message: "缺少 annotations/demo 夹具", path: dest };
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(demo, "gene2go.tsv"), path.join(dest, "gene2go.tsv"));
  fs.copyFileSync(path.join(demo, "gene2kegg.tsv"), path.join(dest, "gene2kegg.tsv"));
  const readme = path.join(dest, "README.txt");
  fs.writeFileSync(
    readme,
    "Copied from annotations/demo for portal try-out. Not real biology. See annotations/README.md.\n",
  );
  return {
    ok: true,
    species: "tryout",
    message: "已复制 demo → annotations/tryout，物种可选 tryout 或 demo",
    path: dest,
  };
}

export function annotationsHelp() {
  return {
    readme_path: path.join(annotationsRoot(), "README.md"),
    help_url_path: "/tools/rnaseq#annotations",
    summary:
      "把 gene2go.tsv / gene2kegg.tsv 放到 services/rnaseq-pipeline/annotations/<species>/；demo/tryout 仅供冒烟，勿作生物学结论。",
  };
}
