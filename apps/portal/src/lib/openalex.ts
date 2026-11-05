const OA = "https://api.openalex.org";

function mailto() {
  return process.env.OPENALEX_MAILTO || "keyantong@example.com";
}

function apiKey() {
  return process.env.OPENALEX_API_KEY?.trim() || "";
}

export type PaperNode = {
  id: string;
  doi: string | null;
  title: string;
  year: number | null;
  citedBy: number;
  oaUrl: string | null;
  landing: string | null;
  role: "seed" | "reference" | "citation";
};

export type PaperGraph = {
  seed: PaperNode;
  nodes: PaperNode[];
  edges: { from: string; to: string; kind: "cites" }[];
  warnings?: string[];
};

type OaWork = {
  id: string;
  doi?: string | null;
  display_name?: string;
  publication_year?: number;
  cited_by_count?: number;
  referenced_works?: string[];
  primary_location?: {
    landing_page_url?: string | null;
    is_oa?: boolean;
    pdf_url?: string | null;
  } | null;
  open_access?: { oa_url?: string | null; is_oa?: boolean };
};

function compactId(id: string) {
  return id.replace("https://openalex.org/", "");
}

function toNode(w: OaWork, role: PaperNode["role"]): PaperNode {
  const oa =
    w.open_access?.oa_url ||
    (w.primary_location?.is_oa ? w.primary_location.pdf_url : null) ||
    null;
  return {
    id: compactId(w.id),
    doi: w.doi ? w.doi.replace("https://doi.org/", "") : null,
    title: w.display_name || compactId(w.id),
    year: w.publication_year ?? null,
    citedBy: w.cited_by_count ?? 0,
    oaUrl: oa,
    landing: w.primary_location?.landing_page_url || (w.doi ? w.doi : null),
    role,
  };
}

async function oaGet<T>(
  path: string,
): Promise<{ data: T | null; error?: string }> {
  try {
    const url = path.startsWith("http") ? path : `${OA}${path}`;
    const u = new URL(url);
    u.searchParams.set("mailto", mailto());
    const key = apiKey();
    if (key) u.searchParams.set("api_key", key);
    const headers: Record<string, string> = {
      "User-Agent": `KeyanTong (mailto:${mailto()})`,
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    const res = await fetch(u.toString(), {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403)
      return {
        data: null,
        error: "文献数据源需要有效的 OPENALEX_API_KEY，请联系站务配置。",
      };
    if (res.status === 429) {
      return {
        data: null,
        error:
          "OpenAlex 额度已用尽。请在环境变量配置免费的 OPENALEX_API_KEY 后重试。",
      };
    }
    if (!res.ok) {
      return { data: null, error: `OpenAlex 返回 ${res.status}` };
    }
    return { data: (await res.json()) as T };
  } catch {
    return { data: null, error: "无法连接 OpenAlex" };
  }
}

export async function searchWorks(q: string, perPage = 8) {
  const { data, error } = await oaGet<{ results: OaWork[] }>(
    `/works?search=${encodeURIComponent(q)}&per_page=${perPage}`,
  );
  return {
    results: (data?.results || []).map((w) => toNode(w, "seed")),
    error,
  };
}

async function hydrate(
  ids: string[],
): Promise<{ works: OaWork[]; error?: string }> {
  if (!ids.length) return { works: [] };
  const filter = `openalex_id:${ids.slice(0, 24).map(compactId).join("|")}`;
  const { data, error } = await oaGet<{ results: OaWork[] }>(
    `/works?filter=${encodeURIComponent(filter)}&per_page=24`,
  );
  return { works: data?.results || [], error };
}

function parseWorkKey(raw: string) {
  const s = raw.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  if (/^10\.\d+\//.test(s)) return `doi:${s}`;
  if (s.toLowerCase().startsWith("doi:")) return s;
  if (/^W\d+$/i.test(s)) return s;
  if (s.includes("openalex.org/W")) return compactId(s);
  return null;
}

export async function buildGraph(
  query: string,
): Promise<{ graph: PaperGraph | null; error?: string }> {
  const key = parseWorkKey(query);
  let seedWork: OaWork | null = null;
  let error: string | undefined;
  if (key) {
    const got = await oaGet<OaWork>(`/works/${encodeURIComponent(key)}`);
    seedWork = got.data;
    error = got.error;
  }
  if (!seedWork && !key) {
    const found = await oaGet<{ results: OaWork[] }>(
      `/works?search=${encodeURIComponent(query)}&per_page=1`,
    );
    seedWork = found.data?.results?.[0] ?? null;
    error = found.error || error;
  }
  if (!seedWork?.id) return { graph: null, error: error || "未找到该文献" };

  const seed = toNode(seedWork, "seed");
  const refIds = (seedWork.referenced_works || []).slice(0, 24);
  const [citedResult, refsResult] = await Promise.all([
    oaGet<{ results: OaWork[] }>(
      `/works?filter=cites:${compactId(seedWork.id)}&per_page=24&sort=cited_by_count:desc`,
    ),
    hydrate(refIds),
  ]);
  const cited = citedResult.data?.results || [];
  const refs = refsResult.works;
  const warnings = [
    citedResult.error && `被引邻域加载不完整：${citedResult.error}`,
    refsResult.error && `参考文献加载不完整：${refsResult.error}`,
  ].filter((x): x is string => Boolean(x));

  const nodes: PaperNode[] = [seed];
  const seen = new Set([seed.id]);
  const edges: PaperGraph["edges"] = [];

  for (const w of refs) {
    const n = toNode(w, "reference");
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    nodes.push(n);
    edges.push({ from: seed.id, to: n.id, kind: "cites" });
  }
  for (const w of cited) {
    const n = toNode(w, "citation");
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    nodes.push(n);
    edges.push({ from: n.id, to: seed.id, kind: "cites" });
  }

  // Capture citation links between neighbors as well as links to the seed.
  for (const work of [...refs, ...cited])
    for (const ref of work.referenced_works || []) {
      const from = compactId(work.id),
        to = compactId(ref);
      if (
        seen.has(to) &&
        from !== to &&
        !edges.some((e) => e.from === from && e.to === to)
      )
        edges.push({ from, to, kind: "cites" });
    }
  return { graph: { seed, nodes, edges, warnings } };
}
