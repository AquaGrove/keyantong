"use client";

import { useMemo, useState } from "react";
import type { ToolCard } from "@/lib/catalog";

export function ToolsCatalog({ tools }: { tools: ToolCard[] }) {
  const [cat, setCat] = useState("all");
  const cats = useMemo(() => {
    const set = new Set<string>();
    for (const t of tools) for (const c of t.categories || []) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [tools]);
  const shown = cat === "all" ? tools : tools.filter((t) => t.categories?.includes(cat));

  return (
    <div>
      <div className="tool-filters" role="tablist" aria-label="工具分类">
        <button type="button" className={cat === "all" ? "chip chip-on" : "chip"} onClick={() => setCat("all")}>
          全部
        </button>
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            className={cat === c ? "chip chip-on" : "chip"}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="hub-grid">
        {shown.map((t) => (
          <article key={t.id} className="hub-tile" style={{ cursor: "default" }}>
            <span className="tag">{t.categories?.join(" · ") || "tool"}</span>
            <h3>{t.name}</h3>
            <p>{t.summary}</p>
            <p className="mono" style={{ marginTop: "0.75rem" }}>
              {t.license ? `License ${t.license}` : null}
              {t.author ? ` · ${t.author}` : null}
              {t.docsUrl ? (
                <>
                  {" · "}
                  <a href={t.docsUrl}>文档</a>
                </>
              ) : null}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
