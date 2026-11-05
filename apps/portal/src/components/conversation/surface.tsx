"use client";
import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { describeRead } from "@/lib/agent/receipts";
import { useConversation } from "./provider";
import { ConversationPaperNetwork } from "./paper-network";
import type { PaperGraph } from "@/lib/openalex";
import { PlantIcon } from "@/components/plant-icon";
import { METHODS } from "@/lib/analysis/methods";
import type { Workspace } from "@/lib/agent/types";
const statusName: Record<string, string> = {
  queued: "等待分析",
  running: "正在计算",
  succeeded: "已完成",
  failed: "暂未完成",
  cancelled: "已取消",
  pending_upstream: "等待上游流程",
};
async function read(url: string, signal?: AbortSignal, actor?: string) {
  const r = await fetch(url, { cache: "no-store", signal, headers: { "x-keyantong-actor": actor || "guest" } });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "暂时没有读取到结果");
  return d;
}
export function ConversationSurface({
  mode,
  method,
  id,
  headless = false,
}: {
  mode: Workspace;
  method?: string;
  id?: string;
  headless?: boolean;
}) {
  const params = useSearchParams(),
    agent = useConversation(),
    { setContext, revision, context, report } = agent;
  const query = headless ? context.query || "" : params.get("q") || "";
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const graphCache = useRef<PaperGraph | null>(null);
  useEffect(() => {
    graphCache.current = null;
    if (headless) return;
    setContext({
      workspace: mode,
      query,
      ...(method ? { method: method as any } : {}),
      ...(mode === "post" ? { postId: id } : {}),
      items: [],
    });
  }, [mode, query, method, id, headless, setContext]);
  useEffect(() => {
    if (headless && ["home", "analysis", "ncbi", "pricing"].includes(mode)) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    const readForUser = (url: string, signal?: AbortSignal) => read(url, signal, agent.user?.id);
    async function load() {
      try {
        let d: any;
        if (mode === "genomes" || mode === "tools") {
          const result = await readForUser(
            "/api/resources?kind=" + (mode === "genomes" ? "genome" : "tool"),
            controller.signal,
          );
          if (!active) return;
          const q = query.toLowerCase().trim();
          const words = q.split(/\s+/).filter(Boolean);
          const resources = result.resources.filter(
            (r: any) =>
              !q ||
              [
                r.content.name,
                r.content.summary,
                r.content.species,
                r.content.latinName,
                r.content.category,
                r.content.provider,
              ].some(
                (v) =>
                  String(v || "")
                    .toLowerCase()
                    .includes(q) ||
                  (v && q.includes(String(v).toLowerCase())),
              ) ||
              (words.length > 1 &&
                words.every((w) =>
                  JSON.stringify(r.content).toLowerCase().includes(w),
                )),
          );
          d = { resources };
          setContext({
            items: resources
              .slice((context.page || 0) * 10, (context.page || 0) * 10 + 10)
              .map((r: any) => ({
                id: r.id,
                name: r.content.name,
                url: r.url,
              })),
          });
        } else if (mode === "papers") {
          if (context.graphSeed) {
            const incoming: PaperGraph = await readForUser(
              "/api/papers/graph?q=" + encodeURIComponent(context.graphSeed),
              controller.signal,
            );
            if (!active) return;
            const previous = graphCache.current;
            const nodes = [
              ...new Map(
                [...(previous?.nodes || []), ...incoming.nodes].map((n) => [
                  n.id,
                  n,
                ]),
              ).values(),
            ].slice(0, 160);
            const ids = new Set(nodes.map((n) => n.id));
            const edges = [
              ...new Map(
                [...(previous?.edges || []), ...incoming.edges]
                  .filter((e) => ids.has(e.from) && ids.has(e.to))
                  .map((e) => [e.from + "-" + e.to, e]),
              ).values(),
            ];
            const graph = {
              seed: previous?.seed || incoming.seed,
              nodes,
              edges,
              warnings: incoming.warnings,
            };
            graphCache.current = graph;
            d = { results: nodes, graph };
          } else
            d =
              query.length >= 3
                ? await readForUser(
                    "/api/papers/search?q=" + encodeURIComponent(query),
                    controller.signal,
                  )
                : { results: [] };
          if (!active) return;
          setContext({
            items: (d.results || [])
              .slice((context.page || 0) * 10, (context.page || 0) * 10 + 10)
              .map((p: any) => ({
                id: p.id,
                name: p.title,
                url: p.doi
                  ? `https://doi.org/${p.doi.replace(/^https?:\/\/doi.org\//, "")}`
                  : p.landing ||
                    p.oaUrl ||
                    p.url ||
                    p.landing_page_url ||
                    p.oa_url,
              })),
          });
        } else if (mode === "forum") {
          d = await readForUser(
            "/api/community/posts?q=" + encodeURIComponent(query) + "&limit=30",
            controller.signal,
          );
          if (!active) return;
          setContext({
            items: (d.posts || d.items || []).map((p: any) => ({
              id: p.id,
              name: p.title,
            })),
          });
        } else if (mode === "post" && id) {
          d = await readForUser(
            "/api/community/posts/" + encodeURIComponent(id),
            controller.signal,
          );
          if (!active) return;
          setContext({
            items: (d.post?.responses || []).map((r: any) => ({
              id: r.id,
              name: r.authorLabel,
            })),
          });
        } else if (mode === "account") {
          d = await readForUser("/api/me", controller.signal);
          if (!active) return;
          if (!d.user)
            throw new Error("告诉我“我要登录”，我会在这里帮你完成。");
          setContext({
            items: (d.user.devices || []).map((x: any) => ({
              id: x.id,
              name: x.label,
            })),
          });
        } else if (mode === "notifications") {
          d = await readForUser("/api/notifications", controller.signal);
          if (!active) return;
          setContext({
            items: (d.items || []).map((x: any) => ({
              id: x.id,
              name: x.title || x.message,
            })),
          });
        } else if (mode === "submissions") {
          d = await readForUser("/api/resources/mine", controller.signal);
          if (!active) return;
          setContext({
            items: (d.resources || []).map((r: any) => ({
              id: r.id,
              name: r.content.name,
            })),
          });
        } else if (mode === "workers") {
          d = await readForUser("/api/workers", controller.signal);
          if (!active) return;
          setContext({
            items: (d.agents || []).map((x: any) => ({
              id: x.id,
              name: x.name,
            })),
          });
        } else if (mode === "analysis") {
          if (agent.user) {
            const [omics, rna] = await Promise.all([
              readForUser("/api/analysis/jobs", controller.signal),
              agent.user.entitled
                ? readForUser("/api/tools/jobs?kind=rnaseq", controller.signal)
                : Promise.resolve({ jobs: [] }),
            ]);
            d = {
              jobs: [
                ...omics.jobs.map((j: any) => ({ ...j, kind: "omics" })),
                ...rna.jobs.map((j: any) => ({ ...j, kind: "rnaseq" })),
              ],
            };
          } else d = { jobs: [] };
        } else d = {};
        if (active) {
          const receipt = describeRead(mode,d,context.page || 0);
          if (receipt) report([mode,query,id || ""].join(":"),receipt);
          setData(d);
          setError("");
          setLoading(false);
        }
      } catch (e) {
        if (active && (e as Error).name !== "AbortError") {
          report([mode,query,id || ""].join(":"),(e as Error).message);
          setError((e as Error).message);
          setLoading(false);
        }
      }
    }
    void load();
    const timer =
      mode === "analysis"
        ? setInterval(() => {
            if (document.visibilityState === "visible") void load();
          }, 5000)
        : undefined;
    return () => {
      active = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [
    mode,
    query,
    id,
    method,
    revision,
    agent.user?.id,
    context.page,
    context.graphSeed,
    context.graphMode,
    setContext,
    report,
    headless,
  ]);
  if (headless) return null;
  const configuration = context.method === method ? context.config || {} : {};
  return (
    <main className={`conversation-surface surface-${mode}`}>
      <div className="conversation-reading-note">
        {loading
          ? "我在为你准备相关内容…"
          : error ||
            (mode === "genomes" || mode === "tools"
              ? `这里有 ${data?.resources?.length || 0} 条相关内容。说“打开第几个”即可前往官网，或继续告诉我筛选条件。`
              : mode === "forum"
                ? "这些是研究者们最近的分享。想进一步了解哪一条，直接告诉助手。"
                : mode === "papers"
                  ? "我把检索到的文献放在这里。想读哪一篇、扩展引用关系或寻找合法获取路径，继续告诉我。"
                  : "这块空间会随着我们的对话更新。")}
      </div>
      {(mode === "genomes" || mode === "tools") && data ? (
        <div className="agent-result-grid">
          {data.resources
            .slice((context.page || 0) * 10, (context.page || 0) * 10 + 10)
            .map((r: any, i: number) => (
              <article className="agent-result-card" key={r.id}>
                <span className="agent-result-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="agent-resource-heading">
                  {mode === "genomes" ? (
                    <PlantIcon type={r.content.icon} />
                  ) : (
                    <span className="agent-tool-glyph">✧</span>
                  )}
                  <div>
                    <h2>{r.content.name}</h2>
                    {r.content.latinName ? (
                      <em>{r.content.latinName}</em>
                    ) : null}
                  </div>
                </div>
                <p>{r.content.summary}</p>
                <small>{r.content.provider}</small>
                {r.content.availability ? (
                  <p className="agent-muted">{r.content.availability}</p>
                ) : null}
                <dl>
                  <dt>需要准备</dt>
                  <dd>{r.content.inputs}</dd>
                  <dt>可以获得</dt>
                  <dd>{r.content.outputs}</dd>
                  {mode === "genomes" ? (
                    <>
                      <dt>参考版本</dt>
                      <dd>{r.content.assembly}</dd>
                    </>
                  ) : null}
                  <dt>使用时留意</dt>
                  <dd>{r.content.instructions}</dd>
                  <dt>访问与许可</dt>
                  <dd>
                    {r.content.access} {r.content.license}
                  </dd>
                </dl>
              </article>
            ))}
        </div>
      ) : null}
      {mode === "papers" && data?.graph && context.graphMode !== "list" ? (
        <ConversationPaperNetwork graph={data.graph} mode={context.graphMode} />
      ) : null}
      {mode === "papers" && data ? (
        <div className="agent-reading-list">
          {(data.results || [])
            .slice((context.page || 0) * 10, (context.page || 0) * 10 + 10)
            .map((p: any, i: number) => (
              <article className="agent-result-card" key={p.id}>
                <span className="agent-result-number">{i + 1}</span>
                <h2>{p.title}</h2>
                <p>
                  {p.year || p.publication_year} · {p.venue || p.journal || ""}
                </p>
                <p>
                  {Array.isArray(p.authors)
                    ? p.authors
                        .map((a: any) => (typeof a === "string" ? a : a.name))
                        .slice(0, 6)
                        .join("、")
                    : ""}
                </p>
                {p.doi ? <small>{p.doi}</small> : null}
                <p className="agent-muted">
                  {p.oaUrl || p.is_oa
                    ? "有开放获取来源"
                    : "获取状态请以来源记录为准"}
                </p>
              </article>
            ))}
        </div>
      ) : null}
      {mode === "forum" && data ? (
        <div className="agent-reading-list">
          {(data.posts || data.items || []).map((p: any, i: number) => (
            <article className="agent-result-card" key={p.id}>
              <span className="agent-result-number">{i + 1}</span>
              <h2>{p.title}</h2>
              <p>{p.body}</p>
              <small>
                {p.authorLabel} · {p.responseCount || 0} 条回应
              </small>
            </article>
          ))}
        </div>
      ) : null}
      {mode === "post" && data?.post ? (
        <article className="agent-post">
          <h1>{data.post.title}</h1>
          <p className="agent-muted">{data.post.authorLabel}</p>
          <div className="agent-long-text">{data.post.body}</div>
          <div className="agent-responses">
            {data.post.responses?.map((r: any, i: number) => (
              <article key={r.id}>
                <small>
                  {i + 1}. {r.authorLabel}
                </small>
                <p>{r.body}</p>
              </article>
            ))}
          </div>
          <p className="agent-muted">
            想回应时告诉助手“回复：……”。内容会先整理为草稿。
          </p>
        </article>
      ) : null}
      {mode === "analysis" ? (
        <>
          <div className="agent-analysis-brief">
            {method === "gwas" ? (
              <>
                <p>这次我们从基因型与连续表型，探索性状关联。</p>
                <p className="agent-muted">
                  当前基线适用于二倍体双等位 SNP，包含质控、LD 剪枝、PCA 和
                  PLINK 线性关联；不能代替亲缘混合模型或多倍体模型。
                </p>
              </>
            ) : method === "bsaseq" ? (
              <>
                <p>这次我们比较两个混池中的等位读段频率。</p>
                <p className="agent-muted">
                  提供 SNP-index、ΔSNP-index、读段 Fisher/BH
                  与固定窗口扫描。结果为探索性基线，不提供因果基因或已校准 QTL
                  阈值。
                </p>
              </>
            ) : method === "rnaseq" ? (
              <>
                <p>把表达矩阵和分组文件交给我，我们一起理解表达差异。</p>
                <p className="agent-muted">
                  对照设计、物种、统计引擎和阈值都可以通过对话设置。DESeq2/edgeR
                  需要非负整数原始 counts。
                </p>
              </>
            ) : (
              <p>
                你想从数据里回答什么问题？告诉我研究目标，我会准备相应的工作空间。
              </p>
            )}
            <p className="agent-configuration">
              {Object.keys(configuration).length
                ? Object.entries(configuration)
                    .map(([k, v]) => `${k} = ${v}`)
                    .join(" · ")
                : "使用当前流程的默认设置；需要调整时，直接告诉助手。"}
            </p>
          </div>
          {method === "single-cell" ? (
            <p>
              这个方向尚未开放计算。可以先与助手讨论研究设计或整理协作需求。
            </p>
          ) : null}
          <div className="agent-example-files">
            {method === "rnaseq"
              ? null
              : (METHODS.find((m) => m.module === method)?.files || []).map(
                  (name) => (
                    <a href={`/analysis-examples/${name}`} download key={name}>
                      {name} 合成示例 ↓
                    </a>
                  ),
                )}
          </div>
          <div className="agent-jobs">
            {(data?.jobs || [])
              .filter((j: any) =>
                !method || method === "rnaseq"
                  ? !method || j.kind === "rnaseq"
                  : j.parameters?.method?.startsWith(
                      method === "bsaseq" ? "bsa." : "gwas.",
                    ),
              )
              .map((j: any) => (
                <article key={j.id} className="agent-result-card">
                  <strong>{statusName[j.status] || j.status}</strong>
                  <p className="agent-muted">
                    {new Date(j.created_at || j.createdAt).toLocaleString(
                      "zh-CN",
                    )}{" "}
                    · {j.id.slice(0, 8)}
                  </p>
                  {j.last_error || j.error ? (
                    <p>{j.last_error || j.error}</p>
                  ) : null}
                  {j.parameters?.summary?.warnings?.map((w: string) => (
                    <p key={w} className="agent-muted">
                      {w}
                    </p>
                  ))}
                  {j.status === "succeeded" ? (
                    <a
                      className="agent-download"
                      href={
                        j.kind === "rnaseq"
                          ? `/api/tools/rnaseq/${j.id}/download`
                          : `/api/analysis/jobs/${j.id}/download`
                      }
                    >
                      下载结果与运行记录 ↓
                    </a>
                  ) : null}
                </article>
              ))}
          </div>
        </>
      ) : null}
      {mode === "account" && data?.user ? (
        <section className="agent-account">
          <h1>{data.user.email}</h1>
          <p>
            {data.user.membership === "lifetime"
              ? "永久会员"
              : data.user.entitled
                ? "当前计算权益有效"
                : "基础交流与资源贡献可用，当前计算权益已到期。"}
          </p>
          {data.user.devices?.map((d: any, i: number) => (
            <article key={d.id} className="agent-result-card">
              <h2>
                {i + 1}. {d.label}
              </h2>
              <p className="agent-muted">
                最近登录：{new Date(d.lastSeen).toLocaleString("zh-CN")}
              </p>
            </article>
          ))}
        </section>
      ) : null}
      {mode === "notifications" && data ? (
        <div className="agent-reading-list">
          {data.items?.map((n: any, i: number) => (
            <article key={n.id} className="agent-result-card">
              <h2>
                {i + 1}. {n.title || "一条新回应"}
              </h2>
              <p>{n.body || n.message}</p>
            </article>
          ))}
        </div>
      ) : null}
      {mode === "submissions" && data ? (
        <div className="agent-reading-list">
          {data.resources?.map((r: any, i: number) => (
            <article className="agent-result-card" key={r.id}>
              <h2>
                {i + 1}. {r.content.name}
              </h2>
              <p>
                {
                  (
                    {
                      pending: "正在等待审核",
                      published: "已收录",
                      rejected: "需要补充说明",
                      withdrawn: "已下架",
                    } as Record<string, string>
                  )[r.status]
                }
              </p>
              <p>{r.review_note}</p>
              <p className="agent-muted">需要修改时告诉助手“修订第几个”。</p>
            </article>
          ))}
        </div>
      ) : null}
      {mode === "workers" && data ? (
        <div className="agent-result-grid">
          {data.agents?.map((a: any, i: number) => (
            <article key={a.id} className="agent-result-card">
              <span className="agent-result-number">{i + 1}</span>
              <h2>{a.name}</h2>
              <p>{a.persona}</p>
              <p className="agent-muted">{a.skills?.join(" · ")}</p>
            </article>
          ))}
          {!data.agents?.length ? (
            <p>
              还没有专属伙伴。告诉助手你希望它叫什么、擅长什么、怎样与你相处，就能一起建立它。
            </p>
          ) : null}
        </div>
      ) : null}
      {mode === "ncbi" ? (
        <section className="agent-ncbi">
          <p>我们可以先核对项目、样本、文库和文件名清单，再准备本机上传。</p>
          <p className="agent-muted">
            这里只接收元数据 JSON。FASTQ、账号密码、cookies
            和私钥留在你的电脑，不上传到网站。当前本机助手为开发预览，系统安装和
            NCBI 最终提交仍需在本机核对。
          </p>
          <a
            className="agent-download"
            href="/downloads/keyantong-ncbi-assistant-preview.zip"
            download
          >
            下载本机助手开发预览 ↓
          </a>
        </section>
      ) : null}
      {mode === "pricing" ? (
        <section className="agent-post">
          <p>
            基础对话调度、公开内容浏览与科研贡献对普通用户开放。计算任务和深入
            AI 分析需要有效校园试用或永久会员。
          </p>
          <p>
            校园验证后试用 7
            天。具体账号权益以你的实际账号状态为准；需要查看，直接告诉助手。
          </p>
        </section>
      ) : null}
      {!loading &&
      !error &&
      data &&
      ["genomes", "tools", "papers", "forum"].includes(mode) &&
      !(
        data.resources?.length ||
        data.results?.length ||
        data.posts?.length ||
        data.items?.length
      ) ? (
        <p className="agent-empty">
          暂时没有匹配内容。换一种描述，或者告诉助手你想补充什么，我们继续。
        </p>
      ) : null}
    </main>
  );
}

export function ConversationReader() {
  const { context, activeTask } = useConversation();
  return <ConversationSurface
    key={activeTask || "new-task"}
    mode={context.workspace || "home"}
    method={context.method}
    id={context.workspace === "post" ? context.postId : undefined}
    headless
  />;
}
