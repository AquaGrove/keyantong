"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ToolCard } from "@/lib/catalog";

export function ToolsCatalog({ tools }: { tools: ToolCard[] }) {
  const [query, setQuery] = useState("");
  const [resourceType, setResourceType] = useState("all");
  const [cat, setCat] = useState("all");
  const cats = useMemo(() => {
    const set = new Set<string>();
    for (const t of tools) for (const c of t.categories || []) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [tools]);
  const typeOf = (t: ToolCard) =>
    t.resourceType ||
    (["openalex", "unpaywall", "ncbi-sra-upload"].includes(t.id)
      ? "website"
      : "software");
  const shown = tools.filter(
    (t) =>
      (cat === "all" || t.categories?.includes(cat)) &&
      (resourceType === "all" || typeOf(t) === resourceType) &&
      `${t.name} ${t.summary} ${(t.categories || []).join(" ")}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  return (
    <div>
      <div className="catalog-search">
        <label htmlFor="catalog-search">
          搜索科研工具
          <input
            id="catalog-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="工具名称、用途、关键词…"
          />
        </label>
        <div role="group" className="tool-filters" aria-label="工具形式">
          {[
            ["all", "全部形式"],
            ["plugin", "科研插件"],
            ["software", "科研软件"],
            ["website", "在线网站"],
          ].map(([id, name]) => (
            <button
              type="button"
              key={id}
              className={`chip ${resourceType === id ? "chip-on" : ""}`}
              aria-pressed={resourceType === id}
              onClick={() => setResourceType(id)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      <div className="tool-filters" role="group" aria-label="工具分类">
        <button
          type="button"
          aria-pressed={cat === "all"}
          className={cat === "all" ? "chip chip-on" : "chip"}
          onClick={() => setCat("all")}
        >
          全部
        </button>
        {cats.map((c) => (
          <button
            key={c}
            aria-pressed={cat === c}
            type="button"
            className={cat === c ? "chip chip-on" : "chip"}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="form-note catalog-count">找到 {shown.length} 个工具</p>
      {shown.length === 0 ? (
        <p className="feed-empty">
          还没有匹配的工具。试试其他关键词，或到工具分享板发起求助。
        </p>
      ) : null}
      <div className="hub-grid">
        {shown.map((t) => {
          const body = (
            <>
              <span className="tag">
                {
                  (
                    {
                      plugin: "科研插件",
                      software: "科研软件",
                      website: "在线网站",
                    } as Record<string, string>
                  )[typeOf(t)]
                }{" "}
                · {t.categories?.join(" · ") || "tool"}
              </span>
              <h3>
                {t.portalPath ? (
                  <Link href={t.portalPath}>{t.name}</Link>
                ) : (
                  t.name
                )}
              </h3>
              <p>{t.summary}</p>
              <p className="mono" style={{ marginTop: "0.75rem" }}>
                {t.license ? `License ${t.license}` : null}
                {t.author ? ` · ${t.author}` : null}
                {t.docsUrl ? (
                  <>
                    {" · "}
                    <a href={t.docsUrl} onClick={(e) => e.stopPropagation()}>
                      文档
                    </a>
                  </>
                ) : null}
                {t.portalPath ? " · 可在线运行" : null}
              </p>
            </>
          );
          return (
            <article
              key={t.id}
              className="hub-tile"
              style={{ cursor: "default" }}
            >
              {body}
            </article>
          );
        })}
      </div>
    </div>
  );
}
