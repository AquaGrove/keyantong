"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PaperGraph, PaperNode } from "@/lib/openalex";

function layout(graph: PaperGraph) {
  const w = 720;
  const h = 520;
  const cx = w / 2;
  const cy = h / 2;
  const pos = new Map<string, { x: number; y: number }>();
  pos.set(graph.seed.id, { x: cx, y: cy });
  const refs = graph.nodes.filter((n) => n.role === "reference");
  const cits = graph.nodes.filter((n) => n.role === "citation");
  refs.forEach((n, i) => {
    const a = (i / Math.max(refs.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: cx + Math.cos(a) * 150, y: cy + Math.sin(a) * 110 });
  });
  cits.forEach((n, i) => {
    const a = (i / Math.max(cits.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: cx + Math.cos(a) * 250, y: cy + Math.sin(a) * 190 });
  });
  return { w, h, pos };
}

export function PaperGraphView({ graph }: { graph: PaperGraph }) {
  const [sel, setSel] = useState<PaperNode>(graph.seed);
  const { w, h, pos } = useMemo(() => layout(graph), [graph]);

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="paper-svg" role="img" aria-label="文献关系图">
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgba(11,31,51,0.18)"
              strokeWidth="1"
            />
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const r = n.role === "seed" ? 14 : 8 + Math.min(n.citedBy / 400, 6);
          const fill =
            n.role === "seed" ? "#0f766e" : n.role === "citation" ? "#0b1f33" : "#b45309";
          return (
            <g key={n.id} onClick={() => setSel(n)} style={{ cursor: "pointer" }}>
              <circle cx={p.x} cy={p.y} r={r} fill={fill} opacity={sel.id === n.id ? 1 : 0.85} />
              {n.role === "seed" ? (
                <text x={p.x} y={p.y + 28} textAnchor="middle" fontSize="11" fill="#0b1f33">
                  种子
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <aside className="graph-detail">
        <p className="tag">
          {sel.role === "seed" ? "种子" : sel.role === "reference" ? "参考文献（更早）" : "被引（更新）"}
        </p>
        <h3>{sel.title}</h3>
        <p className="mono">
          {sel.year || "—"} · 被引 {sel.citedBy}
          {sel.doi ? ` · ${sel.doi}` : ""}
        </p>
        <div className="actions" style={{ marginTop: "0.75rem" }}>
          {sel.landing ? (
            <a className="btn btn-secondary" href={sel.landing} target="_blank" rel="noreferrer">
              官方页面
            </a>
          ) : null}
          {sel.oaUrl ? (
            <a className="btn btn-primary" href={sel.oaUrl} target="_blank" rel="noreferrer">
              OA 链接
            </a>
          ) : (
            <Link
              className="btn btn-secondary"
              href={`/community?doi=${encodeURIComponent(sel.doi || sel.title)}#ask`}
            >
              合规求助
            </Link>
          )}
        </div>
        <p className="form-note">
          内圈为参考文献，外圈为引用本篇的文献。数据来自 OpenAlex，仅元数据与合法链接。
        </p>
      </aside>
    </div>
  );
}
