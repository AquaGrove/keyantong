"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
          <article key={t.id} className="hub-tile" style={t.route ? undefined : { cursor: "default" }}>
            <span className="tag">
              {t.categories?.join(" · ") || "tool"}
              {t.status === "available" ? <span className="tool-badge tool-badge-live">可运行</span> : null}
              {t.status === "coming_soon" ? <span className="tool-badge">即将上线</span> : null}
            </span>
            <h3>{t.name}</h3>
            <p>{t.summary}</p>
            {t.tags?.length ? <p className="mono" style={{ marginTop: "0.55rem" }}>{t.tags.join(" · ")}</p> : null}
            <p className="mono" style={{ marginTop: "0.75rem" }}>
              {t.license ? `License ${t.license}` : null}
              {t.author ? ` · ${t.author}` : null}
              {t.route ? (
                <>
                  {" · "}
                  <Link href={t.route}>{t.status === "coming_soon" ? "查看说明" : "打开"}</Link>
                </>
              ) : null}
              {t.docsUrl && t.docsUrl !== t.route ? (
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
