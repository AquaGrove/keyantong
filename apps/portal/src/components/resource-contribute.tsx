"use client";
import { useState, type FormEvent } from "react";
import type { ResearchResource, ResourceKind } from "@/lib/resources/types";
const statuses = {
  pending: "待审核",
  published: "已收录",
  rejected: "未通过",
  withdrawn: "已下架",
};
export function ResourceContribute({
  kind,
  loggedIn,
}: {
  kind: ResourceKind;
  loggedIn: boolean;
}) {
  const [edit, setEdit] = useState<ResearchResource | null>(null);
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [mine, setMine] = useState<ResearchResource[]>([]);
  async function refresh() {
    try {
      const r = await fetch("/api/resources/mine");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMine(d.resources);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "读取失败");
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      fd = new FormData(form),
      content = Object.fromEntries(fd.entries());
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          url: fd.get("url"),
          content,
          ...(edit ? { id: edit.id, version: edit.version } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage("已提交审核。管理员核对来源、用途与许可后才会公开展示。");
      form.reset();
      setEdit(null);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section resource-contribute" id="contribute">
      <div className="contribution-callout">
        <div>
          <p className="page-kicker">CURATED BY THE COMMUNITY</p>
          <h2>让你熟悉的资源，帮助更多研究者。</h2>
          <p>
            请附上官网、具体用途、输入输出和操作步骤。所有补充都经过后台审核后公开。
          </p>
        </div>
        {loggedIn ? (
          <button
            className="btn btn-primary"
            onClick={() => setShow(!show)}
            aria-expanded={show}
          >
            {show ? "收起表单" : "补充资源 ↗"}
          </button>
        ) : (
          <a
            className="btn btn-primary"
            href={`/login?next=${kind === "genome" ? "/genomes" : "/tools"}%23contribute`}
          >
            登录并补充 ↗
          </a>
        )}
      </div>
      {show && loggedIn ? (
        <form
          key={`${edit?.id || "new"}-${edit?.version || 0}`}
          className="resource-form"
          onSubmit={submit}
        >
          <div className="resource-form-grid">
            {[
              ["name", "资源名称", "例如：马铃薯 Spud DB"],
              ["url", "官方 HTTPS 网址", "https://…"],
              ["provider", "维护机构 / 团队", "提供资源的大学、机构或开发团队"],
              ["category", "分类", "例如：蔬菜薯类 / 蛋白定位"],
              ...(kind === "genome"
                ? [
                    ["species", "物种中文名", "马铃薯"],
                    ["latinName", "拉丁名", "Solanum tuberosum"],
                    [
                      "assembly",
                      "组装与注释版本",
                      "如 DM v6.1；未知请写以官网为准",
                    ],
                  ]
                : []),
              ["sourceUrl", "来源 / 官方文档网址", "https://…"],
              ["inputs", "需要哪些输入", "文件格式、物种、基因 ID 等"],
              ["outputs", "能获得什么结果", "下载文件、预测结果或报告"],
              ["access", "访问要求", "免费 / 注册 / 限额 / 需机构访问"],
              ["license", "许可与引用要求", "注明许可；未知请写需核对官方条款"],
            ].map(([name, label, placeholder]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  defaultValue={
                    edit
                      ? name === "url"
                        ? edit.url
                        : edit.content[name as keyof typeof edit.content] || ""
                      : undefined
                  }
                  placeholder={placeholder}
                  required={name !== "assembly"}
                  type={name === "url" || name === "sourceUrl" ? "url" : "text"}
                  maxLength={
                    name.includes("Url") || name === "url" ? 1500 : 800
                  }
                />
              </label>
            ))}
          </div>
          <label>
            用途说明
            <textarea
              defaultValue={edit?.content.summary}
              name="summary"
              required
              minLength={10}
              maxLength={500}
              rows={2}
              placeholder="解决什么科研问题，适用哪些物种或数据？"
            />
          </label>
          <label>
            详细使用步骤
            <textarea
              defaultValue={edit?.content.instructions}
              name="instructions"
              required
              minLength={20}
              maxLength={2500}
              rows={4}
              placeholder="例如：进入下载页 → 选择品系与组装版本 → 下载匹配的 FASTA 与 GFF3 → 核对校验和。至少 20 字。"
            />
          </label>
          <label className="resource-consent">
            <input type="checkbox" required />
            我已核对来源与说明，不提交密码、私钥、受限下载凭据或个人隐私。
          </label>
          <button disabled={busy} className="btn btn-primary">
            {busy ? "正在提交…" : "提交后台审核"}
          </button>
        </form>
      ) : null}
      <p role="status" className="form-note">
        {message}
      </p>
      {loggedIn ? (
        <>
          <button className="btn btn-secondary" onClick={refresh}>
            查看我的提交记录
          </button>
          <ul className="submission-list">
            {mine.map((r) => (
              <li key={r.id}>
                <strong>{r.content.name}</strong>
                <span>{statuses[r.status]}</span>
                {r.kind === kind && r.status !== "published" ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      setEdit(r);
                      setShow(true);
                      setMessage("已载入原说明，请修改后重新提交审核。");
                      document
                        .getElementById("contribute")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    修订并重新提交
                  </button>
                ) : null}
                {r.review_note ? <p>{r.review_note}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
