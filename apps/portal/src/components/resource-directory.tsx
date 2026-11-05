"use client";
import { useMemo, useState } from "react";
import type { ResearchResource, ResourceKind } from "@/lib/resources/types";
import { PlantIcon } from "./plant-icon";
export function ResourceDirectory({
  resources,
  kind,
}: {
  resources: ResearchResource[];
  kind: ResourceKind;
}) {
  const [q, setQ] = useState(""),
    [category, setCategory] = useState("全部"),
    [open, setOpen] = useState<string | null>(null);
  const categories = useMemo(
    () => ["全部", ...new Set(resources.map((r) => r.content.category))],
    [resources],
  );
  const found = resources.filter(
    (r) =>
      (category === "全部" || r.content.category === category) &&
      [
        r.content.name,
        r.content.summary,
        r.content.species,
        r.content.latinName,
        r.content.provider,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q.toLowerCase().trim()),
  );
  return (
    <section className="resource-directory">
      <div className="resource-search">
        <label htmlFor={`find-${kind}`}>
          搜索{kind === "genome" ? "植物与基因组" : "科研网站"}
          <input
            id={`find-${kind}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              kind === "genome"
                ? "马铃薯 / 水稻 / Solanum / Spud DB…"
                : "转录因子 / 信号肽 / motif / 富集…"
            }
          />
        </label>
        <span className="resource-total">
          <strong>{resources.length}</strong> 个资源 · 持续共建
        </span>
      </div>
      <div className="tool-filters" role="group" aria-label="资源分类">
        {categories.map((c) => (
          <button
            key={c}
            className={`chip ${c === category ? "chip-on" : ""}`}
            aria-pressed={c === category}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="form-note" role="status">
        找到 {found.length} 个匹配资源 · 点击官网直达，展开说明核对输入与版本。
      </p>
      <div className="resource-grid">
        {found.map((r) => {
          const c = r.content;
          return (
            <article key={r.id} className="resource-card">
              <div className="resource-card-heading">
                {kind === "genome" ? (
                  <div className="plant-medallion">
                    <PlantIcon type={c.icon} />
                  </div>
                ) : (
                  <span className="resource-initial" aria-hidden="true">
                    {c.name.slice(0, 2)}
                  </span>
                )}
                <div>
                  <span className="resource-category">{c.category}</span>
                  <h2>{c.name}</h2>
                  {c.latinName ? <em>{c.latinName}</em> : null}
                </div>
              </div>
              <p className="resource-summary">{c.summary}</p>
              <p className="resource-provider">{c.provider}</p>
              {c.availability ? (
                <p className="resource-availability">{c.availability}</p>
              ) : null}
              {kind === "genome" ? (
                <p className="resource-assembly">组装 / 注释：{c.assembly}</p>
              ) : null}
              <div className="resource-actions">
                <a
                  className="btn btn-primary"
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  官方网站 ↗
                </a>
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-expanded={open === r.id}
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                >
                  使用说明 {open === r.id ? "−" : "+"}
                </button>
              </div>
              {open === r.id ? (
                <dl className="resource-details">
                  {[
                    ["输入", c.inputs],
                    ["输出", c.outputs],
                    ["使用步骤", c.instructions],
                    ["访问要求", c.access],
                    ["许可与引用", c.license],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>来源说明</dt>
                    <dd>
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        查看资源来源 ↗
                      </a>
                    </dd>
                  </div>
                </dl>
              ) : null}
            </article>
          );
        })}
      </div>
      {!found.length ? (
        <div className="feed-empty">
          没有找到匹配项。可以在下方补充资源，审核后将加入目录。
        </div>
      ) : null}
    </section>
  );
}
