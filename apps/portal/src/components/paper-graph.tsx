"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { PaperGraph, PaperNode } from "@/lib/openalex";
function layout(graph: PaperGraph) {
  const w = 900,
    h = 600,
    cx = w / 2,
    cy = h / 2;
  const pos = new Map<string, { x: number; y: number }>();
  pos.set(graph.seed.id, { x: cx, y: cy });
  const refs = graph.nodes.filter((n) => n.role === "reference"),
    citations = graph.nodes.filter((n) => n.role === "citation");
  for (const [nodes, base] of [
    [refs, 160],
    [citations, 250],
  ] as const)
    nodes.forEach((n, i) => {
      const a = i * 2.39996323;
      const r = base + (Math.floor(i / 12) % 4) * 28;
      pos.set(n.id, {
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r * 0.72,
      });
    });
  return { w, h, pos };
}
export function PaperGraphView({
  graph,
  focusedId,
  onExpand,
  busy,
}: {
  graph: PaperGraph;
  focusedId?: string;
  onExpand: (node: PaperNode) => void;
  busy: boolean;
}) {
  const [selected, setSelected] = useState(focusedId || graph.seed.id);
  const [mode, setMode] = useState("network");
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState("all");
  const sel = graph.nodes.find((n) => n.id === selected) || graph.seed;
  const { w, h, pos } = useMemo(() => layout(graph), [graph]);
  const visible = graph.nodes.filter(
    (n) => filter === "all" || (filter === "oa" ? n.oaUrl : n.role === filter),
  );
  return (
    <div className="paper-network">
      <div className="graph-controls">
        <div className="tool-filters" role="group" aria-label="文献显示模式">
          {[
            ["network", "网络图"],
            ["timeline", "时间线"],
            ["list", "文献列表"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip ${mode === id ? "chip-on" : ""}`}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="graph-filter">
          筛选
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">全部文献</option>
            <option value="reference">参考文献</option>
            <option value="citation">后续引用</option>
            <option value="oa">开放获取</option>
          </select>
        </label>
      </div>
      <div className="graph-wrap">
        <div className="graph-canvas">
          {mode === "network" ? (
            <>
              <div className="graph-zoom">
                <button
                  className="linkish"
                  type="button"
                  aria-label="缩小网络图"
                  disabled={zoom <= 0.7}
                  onClick={() => setZoom((z) => Math.max(0.7, z - 0.2))}
                >
                  −
                </button>
                <button
                  className="linkish"
                  type="button"
                  onClick={() => setZoom(1)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="linkish"
                  type="button"
                  aria-label="放大网络图"
                  disabled={zoom >= 2}
                  onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
                >
                  +
                </button>
              </div>
              <svg
                viewBox={`0 0 ${w} ${h}`}
                className="paper-svg"
                role="group"
                aria-label="文献引用关系网络，节点可点击或用键盘选择"
              >
                <g
                  transform={`translate(${w / 2} ${h / 2}) scale(${zoom}) translate(${-w / 2} ${-h / 2})`}
                >
                  {graph.edges.map((e) => {
                    const a = pos.get(e.from),
                      b = pos.get(e.to);
                    if (!a || !b) return null;
                    const active = e.from === sel.id || e.to === sel.id;
                    return (
                      <line
                        key={`${e.from}:${e.to}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={active ? "#237461" : "#cbd7cf"}
                        strokeWidth={active ? 2 : 1}
                        opacity={active ? 0.8 : 0.55}
                      />
                    );
                  })}
                  {visible.map((n) => {
                    const p = pos.get(n.id);
                    if (!p) return null;
                    const r =
                      n.role === "seed"
                        ? 18
                        : Math.min(16, 6 + Math.log2(n.citedBy + 1));
                    const fill =
                      n.role === "seed"
                        ? "#205b4d"
                        : n.role === "citation"
                          ? "#718caa"
                          : "#b18a57";
                    return (
                      <g
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`${n.title}，${n.year || "年份未知"}`}
                        aria-pressed={sel.id === n.id}
                        onClick={() => setSelected(n.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(n.id);
                          }
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <title>{n.title}</title>
                        {sel.id === n.id ? (
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={r + 7}
                            fill="none"
                            stroke="#237461"
                            strokeWidth={2}
                          />
                        ) : null}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={r}
                          fill={fill}
                          stroke="white"
                          strokeWidth="2"
                        />
                        {sel.id === n.id || n.role === "seed" ? (
                          <text
                            x={p.x}
                            y={p.y + r + 22}
                            textAnchor="middle"
                            fontSize="12"
                            fill="#203c37"
                          >
                            {n.year || ""} · {n.title.slice(0, 24)}
                            {n.title.length > 24 ? "…" : ""}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              </svg>
              <div className="graph-legend">
                <span>● 种子文献</span>
                <span>● 参考文献</span>
                <span>● 后续引用</span>
                <small>连线表示引用，节点大小表示被引量</small>
              </div>
            </>
          ) : (
            <div
              className={`graph-paper-list ${mode === "timeline" ? "is-timeline" : ""}`}
            >
              {[...visible]
                .sort((a, b) =>
                  mode === "timeline"
                    ? (a.year || 0) - (b.year || 0)
                    : b.citedBy - a.citedBy,
                )
                .map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={sel.id === n.id ? "is-selected" : ""}
                    onClick={() => setSelected(n.id)}
                  >
                    <span>{n.year || "—"}</span>
                    <strong>{n.title}</strong>
                    <small>
                      被引 {n.citedBy}
                      {n.oaUrl ? " · OA" : ""}
                    </small>
                  </button>
                ))}
            </div>
          )}
        </div>
        <aside className="graph-detail">
          <p className="page-kicker">
            {sel.role === "seed"
              ? "SEED / 种子文献"
              : sel.role === "reference"
                ? "REFERENCE / 参考文献"
                : "CITATION / 后续引用"}
          </p>
          <h3>{sel.title}</h3>
          <p className="post-meta">
            {sel.year || "年份未知"} · 被引 {sel.citedBy}
          </p>
          {sel.doi ? <p className="form-note">DOI: {sel.doi}</p> : null}
          <div className="graph-detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => onExpand(sel)}
            >
              {busy ? "暂不可展开" : "以此文献继续拓展 ↗"}
            </button>
            {sel.landing ? (
              <a
                className="btn btn-secondary"
                href={sel.landing}
                target="_blank"
                rel="noreferrer"
              >
                官方页面 ↗
              </a>
            ) : null}
            {sel.oaUrl ? (
              <a
                className="btn btn-secondary"
                href={sel.oaUrl}
                target="_blank"
                rel="noreferrer"
              >
                开放获取链接 ↗
              </a>
            ) : null}
            <Link
              className="linkish"
              href={`/literature?doi=${encodeURIComponent(sel.doi || sel.title)}#research-feed`}
            >
              发起文献求助 ↗
            </Link>
          </div>
          <p className="form-note">
            引用关系来自
            OpenAlex，仅展示本次查询的部分邻域，不代表论文之间的相似度。
          </p>
        </aside>
      </div>
    </div>
  );
}
