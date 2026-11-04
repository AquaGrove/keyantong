"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type PostType = "tool_share" | "tool_help";
type PostStatus = "open" | "resolved" | "archived";

type ToolPost = {
  id: string;
  type: PostType;
  title: string;
  description: string;
  downloadUrl: string | null;
  tags: string[];
  category: string | null;
  authorLabel: string;
  createdAt: string;
  updatedAt: string;
  status: PostStatus;
  linkedShareId: string | null;
  tried?: string | null;
  expectedToolType?: string | null;
};

type ListResponse = {
  items: ToolPost[];
  total: number;
  page: number;
  pageSize: number;
  suggestHelp: boolean;
  error?: string;
};

type Props = {
  entitled: boolean;
  initialTab?: "share" | "help";
  initialQuery?: string;
};

function typeLabel(t: PostType) {
  return t === "tool_share" ? "分享" : "求助";
}

function statusLabel(s: PostStatus) {
  if (s === "open") return "未解决";
  if (s === "resolved") return "已解决";
  return "已归档";
}

export function ToolShareBoard({ entitled, initialTab = "share", initialQuery = "" }: Props) {
  const [tab, setTab] = useState<"share" | "help" | "post-share" | "post-help">(
    initialTab === "help" ? "help" : "share",
  );
  const [q, setQ] = useState(initialQuery);
  const [submittedQ, setSubmittedQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [resolveFor, setResolveFor] = useState<ToolPost | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (submittedQ.trim()) params.set("q", submittedQ.trim());
      if (tab === "share") params.set("type", "tool_share");
      if (tab === "help") params.set("type", "tool_help");
      params.set("pageSize", "30");
      const res = await fetch(`/api/community/tools?${params.toString()}`, {
        credentials: "same-origin",
      });
      const json = (await res.json()) as ListResponse;
      if (!res.ok) throw new Error(json.error || "加载失败");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [submittedQ, tab]);

  useEffect(() => {
    if (tab === "share" || tab === "help") void load();
  }, [tab, load]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setSubmittedQ(q);
    if (tab === "post-share" || tab === "post-help") setTab("share");
  }

  return (
    <div className="tool-share-board">
      <div className="rules-banner" role="note">
        <strong>合规与安全：</strong>
        只分享开源、自有或明确授权的科研工具<strong>外链</strong>（http/https）。勿上传安装包到本站；勿贴盗版文献站、破解软件或引导 PDF
        互传。用户输入按纯文本处理，请勿粘贴脚本。
      </div>

      <div className="actions" style={{ marginTop: "1rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn ${tab === "share" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("share")}
        >
          工具分享
        </button>
        <button
          type="button"
          className={`btn ${tab === "help" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("help")}
        >
          工具求助
        </button>
        {entitled ? (
          <>
            <button
              type="button"
              className={`btn ${tab === "post-share" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab("post-share")}
            >
              我要分享工具
            </button>
            <button
              type="button"
              className={`btn ${tab === "post-help" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setTab("post-help")}
            >
              我要求助
            </button>
          </>
        ) : (
          <>
            <Link className="btn btn-secondary" href="/login">
              登录后发帖
            </Link>
            <Link className="btn btn-secondary" href="/pricing">
              会员说明
            </Link>
          </>
        )}
        <Link className="btn btn-secondary" href="/community#ask">
          文献互助
        </Link>
      </div>

      {(tab === "share" || tab === "help") && (
        <>
          <form className="help-form" onSubmit={onSearch} style={{ marginTop: "1rem" }}>
            <label>
              搜索工具帖（标题 / 描述 / 标签）
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="例如：FastQC、火山图、IGV"
                maxLength={120}
              />
            </label>
            <button className="btn btn-primary" type="submit">
              搜索
            </button>
          </form>

          {loading && <p className="section-lead">加载中…</p>}
          {error && <p className="section-lead" style={{ color: "crimson" }}>{error}</p>}

          {data && !loading && (
            <>
              <p className="section-lead">
                共 {data.total} 条
                {submittedQ.trim() ? ` · 关键词「${submittedQ.trim()}」` : ""}
              </p>
              {data.suggestHelp && (
                <div className="rules-banner" role="status">
                  没有搜到相关工具帖。
                  {entitled ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ marginLeft: "0.5rem" }}
                        onClick={() => setTab("post-help")}
                      >
                        一键去发求助
                      </button>
                    </>
                  ) : (
                    <>
                      {" "}
                      <Link href="/login">登录后</Link>可发求助，让同伴看到并分享工具。
                    </>
                  )}
                </div>
              )}
              <ul className="tool-post-list">
                {data.items.map((p) => (
                  <li key={p.id} className="tool-post-card">
                    <div className="tool-post-meta">
                      <span className="badge">{typeLabel(p.type)}</span>
                      {p.type === "tool_help" && (
                        <span className={`badge ${p.status === "open" ? "badge-bad" : "badge-ok"}`}>
                          {statusLabel(p.status)}
                        </span>
                      )}
                      {p.category && <span className="tag">{p.category}</span>}
                      <span className="mono">{p.authorLabel}</span>
                      <span className="mono">
                        {new Date(p.createdAt).toLocaleString("zh-CN", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <h3>{p.title}</h3>
                    <p>{p.description}</p>
                    {p.tried && <p className="form-note">已尝试：{p.tried}</p>}
                    {p.expectedToolType && (
                      <p className="form-note">期望类型：{p.expectedToolType}</p>
                    )}
                    <div className="tool-post-tags">
                      {p.tags.map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="actions" style={{ marginTop: "0.75rem" }}>
                      {p.downloadUrl && (
                        <a
                          className="btn btn-primary"
                          href={p.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                        >
                          打开下载/官网
                        </a>
                      )}
                      {p.linkedShareId && (
                        <span className="form-note">已关联分享帖 {p.linkedShareId.slice(0, 8)}…</span>
                      )}
                      {p.type === "tool_help" && p.status === "open" && entitled && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setResolveFor(p)}
                        >
                          去解决（发分享并关联）
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {tab === "post-share" && entitled && (
        <ShareForm
          onDone={() => {
            setTab("share");
            setSubmittedQ("");
            setQ("");
          }}
        />
      )}
      {tab === "post-help" && entitled && (
        <HelpForm
          prefillTitle={data?.suggestHelp && submittedQ.trim() ? `求工具：${submittedQ.trim()}` : ""}
          prefillDesc={
            data?.suggestHelp && submittedQ.trim()
              ? `搜索「${submittedQ.trim()}」无结果，希望有人推荐可用工具与合法下载入口。`
              : ""
          }
          onDone={() => {
            setTab("help");
            setSubmittedQ("");
            setQ("");
          }}
        />
      )}

      {resolveFor && entitled && (
        <ResolveModal
          help={resolveFor}
          onClose={() => setResolveFor(null)}
          onDone={() => {
            setResolveFor(null);
            setTab("help");
            void load();
          }}
        />
      )}
    </div>
  );
}

function ShareForm({
  onDone,
  defaults,
}: {
  onDone: () => void;
  defaults?: { title?: string; description?: string; tags?: string };
}) {
  const [title, setTitle] = useState(defaults?.title || "");
  const [description, setDescription] = useState(defaults?.description || "");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [tags, setTags] = useState(defaults?.tags || "");
  const [category, setCategory] = useState("生物信息");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/community/tools", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tool_share",
          title,
          description,
          downloadUrl,
          tags,
          category,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "发布失败");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="help-form" onSubmit={onSubmit} style={{ marginTop: "1rem" }}>
      <h2>分享一个工具</h2>
      <p className="form-note">只需外链 + 功能描述；安装包请放在官方或你有权分发的托管处。</p>
      <label>
        标题
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </label>
      <label>
        功能描述
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={5}
          maxLength={4000}
        />
      </label>
      <label>
        下载 / 官网链接（http/https）
        <input
          value={downloadUrl}
          onChange={(e) => setDownloadUrl(e.target.value)}
          required
          placeholder="https://"
          maxLength={2000}
        />
      </label>
      <label>
        标签（逗号分隔）
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="rnaseq, qc" maxLength={200} />
      </label>
      <label>
        分类
        <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
      </label>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "提交中…" : "发布分享"}
      </button>
    </form>
  );
}

function HelpForm({
  onDone,
  prefillTitle = "",
  prefillDesc = "",
}: {
  onDone: () => void;
  prefillTitle?: string;
  prefillDesc?: string;
}) {
  const [title, setTitle] = useState(prefillTitle);
  const [description, setDescription] = useState(prefillDesc);
  const [tried, setTried] = useState("");
  const [expectedToolType, setExpectedToolType] = useState("分析 / 可视化工具");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (prefillTitle) setTitle(prefillTitle);
    if (prefillDesc) setDescription(prefillDesc);
  }, [prefillTitle, prefillDesc]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/community/tools", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tool_help",
          title,
          description,
          tried,
          expectedToolType,
          tags,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "发布失败");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="help-form" onSubmit={onSubmit} style={{ marginTop: "1rem" }}>
      <h2>工具求助</h2>
      <p className="form-note">说清需求与已尝试方案；他人看到后可发分享帖并标记解决。</p>
      <label>
        标题
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
      </label>
      <label>
        需求描述
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={5}
          maxLength={4000}
        />
      </label>
      <label>
        已尝试
        <textarea value={tried} onChange={(e) => setTried(e.target.value)} rows={3} maxLength={1000} />
      </label>
      <label>
        期望工具类型
        <input
          value={expectedToolType}
          onChange={(e) => setExpectedToolType(e.target.value)}
          maxLength={80}
        />
      </label>
      <label>
        标签（逗号分隔）
        <input value={tags} onChange={(e) => setTags(e.target.value)} maxLength={200} />
      </label>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "提交中…" : "发布求助"}
      </button>
    </form>
  );
}

function ResolveModal({
  help,
  onClose,
  onDone,
}: {
  help: ToolPost;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(`推荐工具：回应「${help.title.slice(0, 40)}」`);
  const [description, setDescription] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/community/tools/${help.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolveWithShare: { title, description, downloadUrl, tags: help.tags },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "提交失败");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-resolve-modal" role="dialog" aria-modal="true">
      <form className="help-form" onSubmit={onSubmit}>
        <h2>去解决该求助</h2>
        <p className="form-note">将发布一条工具分享并自动把求助标为已解决、互相关联。</p>
        <label>
          分享标题
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        </label>
        <label>
          功能描述与用法要点
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            maxLength={4000}
          />
        </label>
        <label>
          合法下载 / 官网链接
          <input
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            required
            maxLength={2000}
          />
        </label>
        {err && <p style={{ color: "crimson" }}>{err}</p>}
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "提交中…" : "发布并标记解决"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
