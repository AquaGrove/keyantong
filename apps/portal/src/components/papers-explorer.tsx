"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { PaperGraph, PaperNode } from "@/lib/openalex";
import { PaperGraphView } from "./paper-graph";

export function PapersExplorer({ entitled }: { entitled: boolean }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PaperNode[]>([]);
  const [graph, setGraph] = useState<PaperGraph | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setGraph(null);
    setHits([]);
    const query = q.trim();
    if (/^10\.\d{4,}\//.test(query) || /^doi:\s*10\./i.test(query)) {
      if (!entitled) {
        setErr("展开关系图需要登录且试用未过期。也可以先搜题名浏览结果。");
      }
      await loadGraph(query.replace(/^doi:\s*/i, ""));
      return;
    }
    const res = await fetch(`/api/papers/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setHits(data.results || []);
    if (data.error) setErr(data.error);
    else if (!(data.results || []).length) setErr("没有匹配的文献，试试 DOI 或更具体的题名。");
  }

  async function loadGraph(query: string) {
    setErr("");
    setLoading(true);
    const res = await fetch(`/api/papers/graph?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setLoading(false);
    if (res.status === 401) {
      setErr("请先登录校园账号");
      return;
    }
    if (res.status === 402) {
      setErr(data.error);
      return;
    }
    if (!res.ok) {
      setErr(data.error || "无法构建关系图");
      return;
    }
    setGraph(data);
  }

  return (
    <div>
      <form className="help-form" onSubmit={search} style={{ maxWidth: "100%" }}>
        <label>
          题名、关键词或 DOI
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="例如 10.1038/nature14539 或 attention is all you need"
            required
          />
        </label>
        <p className="enter-hint mono">按 Enter 搜索</p>
        <button className="enter-submit-hidden" type="submit">
          搜索 OpenAlex
        </button>
      </form>

      {!entitled ? (
        <p className="rules-banner">
          展开关系图需要有效试用或永久会员。
          <Link href="/pricing"> 查看会员说明</Link>
          {" · "}
          <Link href="/login">登录</Link>
        </p>
      ) : null}
      {err ? <p className="rules-banner">{err}</p> : null}
      {loading ? <p className="mono">正在拉取引用邻域…</p> : null}

      {hits.length > 0 && !graph ? (
        <ul className="pulse-list" style={{ marginTop: "1rem" }}>
          {hits.map((h) => (
            <li key={h.id}>
              <span className="mono">{h.year || "—"}</span>
              <button
                type="button"
                className="linkish"
                onClick={() => loadGraph(h.doi || h.id)}
                disabled={!entitled}
              >
                {h.title}
              </button>
              <span className="mono">被引 {h.citedBy}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {graph ? (
        <>
          <p className="form-note" style={{ marginTop: "1rem" }}>
            <button type="button" className="linkish" onClick={() => setGraph(null)}>
              返回搜索结果
            </button>
          </p>
          <PaperGraphView graph={graph} />
        </>
      ) : null}
    </div>
  );
}
