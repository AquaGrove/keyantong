"use client";
import { useMemo } from "react";
import type { PaperGraph } from "@/lib/openalex";
export function ConversationPaperNetwork({
  graph,
  mode = "network",
}: {
  graph: PaperGraph;
  mode?: string;
}) {
  const points = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    graph.nodes.forEach((n, i) => {
      if (mode === "timeline") {
        const years = graph.nodes
          .map((p) => p.year)
          .filter((y): y is number => Boolean(y));
        const min = Math.min(...years, 2020),
          max = Math.max(...years, 2021);
        map.set(n.id, {
          x: 45 + (((n.year || min) - min) / (max - min || 1)) * 710,
          y: 65 + (i % 7) * 43,
        });
      } else {
        const a = i * 2.3999632297,
          r = i === 0 ? 0 : 55 + Math.sqrt(i) * 14;
        map.set(n.id, {
          x: 400 + Math.cos(a) * r,
          y: 210 + Math.sin(a) * r * 0.7,
        });
      }
    });
    return map;
  }, [graph, mode]);
  return (
    <figure className="conversation-paper-network">
      <svg
        viewBox="0 0 800 420"
        role="img"
        aria-label={`实际引用关系，${graph.nodes.length} 篇文献，${graph.edges.length} 条关系`}
      >
        {graph.edges.map((e) => {
          const a = points.get(e.from),
            b = points.get(e.to);
          return a && b ? (
            <line
              key={e.from + "-" + e.to}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#cbd9c6"
              strokeWidth=".7"
            />
          ) : null;
        })}
        {graph.nodes.map((n) => {
          const p = points.get(n.id)!;
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={n.id === graph.seed.id ? 9 : 4.5}
                fill={
                  n.id === graph.seed.id
                    ? "#3f7350"
                    : n.oaUrl
                      ? "#8ab28a"
                      : "#c5ab79"
                }
              >
                <title>
                  {n.title} · {n.year || "年份未知"}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>
      <figcaption>
        {graph.nodes.length} 篇记录 · {graph.edges.length}{" "}
        条已检索关系。继续告诉助手想扩展哪篇、切换时间线或寻找开放获取版本。
      </figcaption>
      {graph.warnings?.map((w) => (
        <p className="agent-muted" key={w}>
          {w}
        </p>
      ))}
    </figure>
  );
}
