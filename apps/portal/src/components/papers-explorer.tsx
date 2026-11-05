"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { PaperGraph, PaperNode } from "@/lib/openalex";
import { PaperGraphView } from "./paper-graph";
export function PapersExplorer({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<PaperNode[]>([]);
  const [graph, setGraph] = useState<PaperGraph | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const [focused, setFocused] = useState("");
  const controller = useRef<AbortController | null>(null);
  async function loadGraph(query: string, extend = false) {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setError("");
    setLoading(true);
    try {
      const r = await fetch(
        `/api/papers/graph?q=${encodeURIComponent(query)}`,
        { signal: ctrl.signal },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "无法构建关系图");
      const incoming = data as PaperGraph;
      setGraph((prev) => {
        if (!extend || !prev) return incoming;
        const nodes = new Map(prev.nodes.map((n) => [n.id, n]));
        incoming.nodes.forEach((n) => {
          if (!nodes.has(n.id))
            nodes.set(n.id, {
              ...n,
              role:
                n.id === prev.seed.id
                  ? "seed"
                  : n.role === "seed"
                    ? "reference"
                    : n.role,
            });
        });
        const allowed = new Set([...nodes.keys()].slice(0, 160));
        const edges = new Map(
          [...prev.edges, ...incoming.edges]
            .filter((e) => allowed.has(e.from) && allowed.has(e.to))
            .map((e) => [`${e.from}:${e.to}`, e]),
        );
        return {
          seed: prev.seed,
          nodes: [...nodes.values()].filter((n) => allowed.has(n.id)),
          edges: [...edges.values()],
          warnings: incoming.warnings,
        };
      });
      setTrail((prev) =>
        extend
          ? [
              ...prev.filter((t) => t !== incoming.seed.title),
              incoming.seed.title,
            ].slice(-6)
          : [incoming.seed.title],
      );
      setFocused(incoming.seed.id);
    } catch (e) {
      if (!ctrl.signal.aborted)
        setError(e instanceof Error ? e.message : "网络异常，请重试");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }
  async function search(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (query.length < 3) {
      setError("请输入至少 3 个字的检索词");
      return;
    }
    if (
      /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?10\.\d+\//i.test(query) ||
      /^(?:https?:\/\/openalex.org\/)?W\d+$/i.test(query)
    ) {
      setHits([]);
      void loadGraph(query);
      return;
    }
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/papers/search?q=${encodeURIComponent(query)}`,
        { signal: ctrl.signal },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "检索失败");
      setHits(data.results || []);
      setGraph(null);
      if (!data.results?.length)
        setError("没有匹配的文献，试试 DOI 或更具体的题名。");
    } catch (e) {
      if (!ctrl.signal.aborted)
        setError(e instanceof Error ? e.message : "检索失败");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }
  return (
    <div className="papers-workspace">
      <form className="paper-search" onSubmit={search}>
        <label htmlFor="paper-query">
          从一篇文献，探索一个方向
          <input
            id="paper-query"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={300}
            minLength={3}
            required
            placeholder="输入 DOI、论文题名或研究关键词"
          />
        </label>
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "检索中…" : "检索文献 ↗"}
        </button>
      </form>
      <p className="form-note">
        公开数据来自
        OpenAlex。选择论文后可展开引用邻域，再以任意节点继续探索；不是相似度推荐，也不保证文献收录完整。
      </p>
      {error ? (
        <div className="rules-banner" role="alert">
          {error}
          <div className="actions">
            <Link
              className="linkish"
              href={`/literature?doi=${encodeURIComponent(q)}#research-feed`}
            >
              转为文献求助 ↗
            </Link>
          </div>
        </div>
      ) : null}
      {loading ? (
        <p className="form-note" role="status">
          正在查询公开学术数据，请稍候…
        </p>
      ) : null}
      {hits.length && !graph ? (
        <div className="paper-results">
          {hits.map((h) => (
            <article key={h.id}>
              <div>
                <span className="mono">
                  {h.year || "年份未知"} · 被引 {h.citedBy}
                </span>
                <h3>{h.title}</h3>
                <p>{h.doi || h.id}</p>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={loading}
                onClick={() => void loadGraph(h.id)}
              >
                建立文献网络 ↗
              </button>
            </article>
          ))}
        </div>
      ) : null}
      {graph ? (
        <>
          <div className="graph-toolbar">
            <span>
              {graph.nodes.length} 篇文献 · {graph.edges.length} 条引用关系
            </span>
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setGraph(null);
                setTrail([]);
              }}
            >
              清空网络
            </button>
          </div>
          <p className="graph-trail">探索路径：{trail.join(" → ")}</p>
          {graph.warnings?.map((w) => (
            <p className="capability-note" key={w}>
              {w}
            </p>
          ))}
          {graph.nodes.length >= 160 ? (
            <p className="form-note">
              本次网络达到 160 篇显示上限，可以清空后以新的文献重新探索。
            </p>
          ) : null}
          <PaperGraphView
            key={`${graph.seed.id}:${focused}`}
            graph={graph}
            focusedId={focused}
            onExpand={(n) => void loadGraph(n.id, true)}
            busy={loading || graph.nodes.length >= 160}
          />
        </>
      ) : !hits.length && !loading ? (
        <div className="paper-empty">
          <div className="paper-map-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="page-kicker">FOLLOW THE CONNECTIONS</p>
            <h3>找到关键文献，也看见它的来处与去向。</h3>
            <p>
              检索 → 选中论文 → 展开网络 →
              继续探索。需要获取帮助时，把文献线索带到互助广场。
            </p>
            <Link className="linkish" href="/literature#research-feed">
              去文献互助广场 ↗
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
