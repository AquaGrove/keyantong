"use client";
import { useEffect, useState } from "react";
type Row = {
  id: string;
  kind: string;
  url: string;
  status: string;
  version: number;
  content: Record<string, string>;
  review_note?: string;
};
export function ResourceReviewPanel() {
  const [rows, setRows] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("pending");
  async function load() {
    try {
      const r = await fetch("/api/resources");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRows(d.resources);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "读取失败");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function review(r: Row, decision: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: r.id,
          version: r.version,
          decision,
          note: fd.get("note"),
          linkVerified: fd.get("verified") === "on",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMessage("审核已保存");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="actions">
        <select
          aria-label="审核状态"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="pending">待审核</option>
          <option value="published">已发布</option>
          <option value="rejected">已退回</option>
          <option value="withdrawn">已下架</option>
          <option value="all">全部</option>
        </select>
        <button onClick={load}>刷新</button>
      </div>
      <p role="status">{message}</p>
      {rows
        .filter((r) => filter === "all" || r.status === filter)
        .map((r) => (
          <article
            className="panel"
            key={r.id}
            style={{ marginBottom: "1rem" }}
          >
            <h2>
              {r.content.name} · {r.kind === "genome" ? "基因组" : "科研工具"}
            </h2>
            <p>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.url} ↗
              </a>
            </p>
            <dl>
              {Object.entries(r.content)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} style={{ marginBottom: ".6rem" }}>
                    <dt>
                      <strong>
                        {(
                          {
                            summary: "用途",
                            category: "分类",
                            species: "物种",
                            latinName: "拉丁名",
                            provider: "维护机构",
                            inputs: "输入",
                            outputs: "输出",
                            instructions: "使用步骤",
                            license: "许可",
                            access: "访问要求",
                            assembly: "组装版本",
                            sourceUrl: "来源",
                          } as Record<string, string>
                        )[k] || k}
                      </strong>
                    </dt>
                    <dd
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {v}
                    </dd>
                  </div>
                ))}
            </dl>
            <form onSubmit={(e) => e.preventDefault()}>
              <label>
                审核说明（至少 10 字）
                <textarea
                  name="note"
                  required
                  minLength={10}
                  maxLength={1500}
                  rows={3}
                  style={{ width: "100%" }}
                  defaultValue={r.review_note || ""}
                />
              </label>
              <label style={{ display: "block", margin: ".8rem 0" }}>
                <input type="checkbox" name="verified" />{" "}
                已核对官网、物种/用途、输入输出和许可要求
              </label>
              <div className="actions">
                {[
                  ["published", "通过并收录"],
                  ["rejected", "退回"],
                  ["withdrawn", "下架"],
                ]
                  .filter(([d]) => d !== r.status)
                  .map(([d, label]) => (
                    <button
                      key={d}
                      disabled={busy}
                      onClick={(e) => {
                        const f = e.currentTarget.form!;
                        if (f.reportValidity()) void review(r, d, f);
                      }}
                    >
                      {label}
                    </button>
                  ))}
              </div>
            </form>
          </article>
        ))}
      {!rows.some((r) => filter === "all" || r.status === filter) ? (
        <p className="panel">当前没有此状态的资源。</p>
      ) : null}
    </>
  );
}
