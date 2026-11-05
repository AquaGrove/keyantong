"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  POST_KINDS,
  type PostKind,
  type PublicPost,
} from "@/lib/community/types";
import { useI18n } from "@/lib/i18n";

export function ResearchFeed({
  loggedIn,
  compact = false,
  initialKind = "all",
  initialDoi = "",
  initialTopic = "",
}: {
  loggedIn: boolean;
  compact?: boolean;
  initialKind?: string;
  initialDoi?: string;
  initialTopic?: string;
}) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    posts: PublicPost[];
    total: number;
    pages: number;
  }>({ posts: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [compose, setCompose] = useState(Boolean(initialDoi || initialTopic));
  const [postKind, setPostKind] = useState<PostKind>(
    Object.hasOwn(POST_KINDS, initialKind)
      ? (initialKind as PostKind)
      : "daily",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      kind,
      q: search,
      page: String(page),
      limit: compact ? "5" : "12",
    });
    fetch(`/api/community/posts?${params}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "加载失败");
        return body;
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [kind, search, page, compact, refresh]);
  async function publish(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: postKind,
          title: values.get("title"),
          body: values.get("body"),
          doi: values.get("doi") || "",
          topic: values.get("topic") || "",
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "发布失败");
      form.reset();
      setCompose(false);
      setKind(postKind);
      setPage(1);
      setSearch("");
      setQuery("");
      setRefresh((v) => v + 1);
      setNotice(
        zh
          ? "已发布，其他研究者现在可以响应你的动态。"
          : "Published. Other researchers can now respond.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }
  const kindLabel = (k: string) =>
    zh
      ? POST_KINDS[k as PostKind]
      : {
          daily: "Daily notes",
          question: "Questions",
          experience: "Experience",
          literature: "Literature",
          collaboration: "Collaboration",
        }[k] || k;
  return (
    <section
      className={`research-feed ${compact ? "research-feed-home" : ""}`}
      id="research-feed"
    >
      <div className="feed-heading">
        <div>
          <p className="page-kicker">THE RESEARCH COMMONS</p>
          <h2>
            {initialKind === "literature"
              ? zh
                ? "文献互助广场"
                : "Literature help"
              : zh
                ? "科研广场"
                : "Research commons"}
          </h2>
          <p>
            {zh
              ? "一切皆可求，皆可响应。你的一个经验，或许就是别人的下一步。"
              : "Ask freely. Share what you know. Help someone take their next step."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          aria-expanded={compose}
          onClick={() => setCompose((v) => !v)}
        >
          {compose
            ? zh
              ? "收起"
              : "Close"
            : zh
              ? "+ 发布动态 / 求助"
              : "+ Share / ask"}
        </button>
      </div>
      {compose ? (
        loggedIn ? (
          <form className="help-form feed-compose" onSubmit={publish}>
            <div className="form-columns">
              <label>
                {zh ? "分类" : "Category"}
                <select
                  value={postKind}
                  onChange={(e) => setPostKind(e.target.value as PostKind)}
                >
                  {Object.keys(POST_KINDS).map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {zh
                  ? "研究方向 / 分析类型（选填）"
                  : "Research topic (optional)"}
                <input
                  name="topic"
                  maxLength={60}
                  defaultValue={initialTopic}
                  placeholder="RNAseq / 植物遗传 / 实验设计"
                />
              </label>
            </div>
            <label>
              {zh ? "用一句话说说你的分享或问题" : "A short title"}
              <input
                name="title"
                required
                minLength={3}
                maxLength={120}
                placeholder={
                  zh
                    ? "今天终于解决了一个困扰很久的问题…"
                    : "What did you discover today?"
                }
              />
            </label>
            {postKind === "literature" ? (
              <label>
                {zh ? "文献 DOI 或完整题名" : "DOI or paper title"}
                <input
                  name="doi"
                  maxLength={300}
                  required
                  defaultValue={initialDoi}
                />
              </label>
            ) : null}
            <label>
              {zh ? "正文" : "Your post"}
              <textarea
                name="body"
                required
                maxLength={6000}
                rows={5}
                placeholder={
                  postKind === "literature"
                    ? "说明需要的文献、已查过的 OA / 馆藏 / 作者稿渠道，以及希望获得的帮助。"
                    : postKind === "collaboration"
                      ? "描述研究目标、数据类型、分组与希望协作者提供的帮助，请勿粘贴原始测序数据。"
                      : "科研感悟、实验瓶颈、踩坑经验、一个小小的进展，都值得记录。"
                }
              />
            </label>
            <p className="form-note">
              {zh
                ? "公开发布，请勿填写个人隐私、密钥或未获授权的数据。文献互助分享合法获取路径。"
                : "Posts are public. Keep credentials, private data, and restricted full text out of your post."}
            </p>
            <button className="btn btn-primary" disabled={busy}>
              {busy
                ? zh
                  ? "发布中…"
                  : "Publishing…"
                : zh
                  ? "发布到广场"
                  : "Publish"}
            </button>
          </form>
        ) : (
          <div className="feed-signin">
            <p>
              {zh
                ? "浏览对所有人开放。登录后即可分享、提问和响应，不需要会员。"
                : "Everyone can browse. Sign in to post and respond; no membership needed."}
            </p>
            <Link className="btn btn-primary" href="/login">
              {zh ? "登录参与" : "Sign in"}
            </Link>
          </div>
        )
      ) : null}
      <div className="feed-toolbar">
        <div
          className="tool-filters"
          role="group"
          aria-label={zh ? "动态分类" : "Post category"}
        >
          {(initialKind === "literature"
            ? ["literature"]
            : ["all", "daily", "question", "experience", "collaboration"]
          ).map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${kind === k ? "chip-on" : ""}`}
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setPage(1);
              }}
            >
              {k === "all" ? (zh ? "全部动态" : "All posts") : kindLabel(k)}
            </button>
          ))}
        </div>
        <form
          className="feed-search"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
            setPage(1);
          }}
        >
          <input
            aria-label={zh ? "搜索动态" : "Search posts"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={zh ? "搜索问题、经验、研究方向" : "Search posts"}
            maxLength={120}
          />
          <button className="btn btn-secondary">
            {zh ? "搜索" : "Search"}
          </button>
        </form>
      </div>
      {notice ? (
        <p role="status" className="success-note">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="ai-error" role="alert">
          {error}
          <button
            type="button"
            className="linkish"
            onClick={() => setRefresh((v) => v + 1)}
          >
            {zh ? "重试" : "Retry"}
          </button>
        </p>
      ) : null}
      {loading ? (
        <p className="feed-empty" role="status">
          {zh ? "正在加载科研动态…" : "Loading…"}
        </p>
      ) : data.posts.length ? (
        <div className="research-post-list">
          {data.posts.map((post) => (
            <article key={post.id} className="research-post">
              <div className="post-byline">
                <span
                  className={`post-avatar post-avatar-${post.kind}`}
                  aria-hidden="true"
                >
                  {post.authorLabel.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  {post.authorLabel}
                  <small>
                    {new Date(post.createdAt).toLocaleDateString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                  </small>
                </span>
                <span className="post-category">{kindLabel(post.kind)}</span>
                {post.acceptedResponseId ? (
                  <span className="resolved-label">
                    {zh ? "已获帮助" : "Answered"}
                  </span>
                ) : null}
              </div>
              <h3>
                <Link href={`/community/${post.id}`}>{post.title}</Link>
              </h3>
              <p className="post-excerpt">{post.body}</p>
              <div className="post-bottom">
                <span>
                  {post.topic
                    ? `# ${post.topic}`
                    : zh
                      ? "每一份分享都有价值"
                      : "Every contribution matters"}
                </span>
                <Link href={`/community/${post.id}`}>
                  {post.responseCount
                    ? `${post.responseCount} ${zh ? "条响应" : "responses"}`
                    : zh
                      ? "我来响应 ↗"
                      : "Respond ↗"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="feed-empty">
          <span aria-hidden="true">↗</span>
          <h3>
            {search
              ? zh
                ? "还没有找到相关动态"
                : "No matching posts"
              : zh
                ? "第一份分享，从你开始"
                : "Be the first to share"}
          </h3>
          <p>
            {search
              ? zh
                ? "换个关键词，或发布你的问题，让更多人看到。"
                : "Try another search or ask the community."
              : zh
                ? "记录一个进展，提出一个问题，或者分享一次踩坑。每个人都能贡献自己的一份力。"
                : "Share a small discovery, ask a question, or help a fellow researcher."}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setCompose(true)}
          >
            {zh ? "写下第一条" : "Write a post"}
          </button>
        </div>
      )}
      {data.pages > 1 ? (
        <div className="feed-pagination">
          <button
            className="btn btn-secondary"
            disabled={page === 1 || loading}
            onClick={() => setPage((v) => v - 1)}
          >
            {zh ? "上一页" : "Previous"}
          </button>
          <span>
            {page} / {data.pages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={page >= data.pages || loading}
            onClick={() => setPage((v) => v + 1)}
          >
            {zh ? "下一页" : "Next"}
          </button>
        </div>
      ) : null}
      {compact ? (
        <Link className="feed-more" href="/community">
          {zh
            ? "进入科研论坛，发现更多分享与求助 →"
            : "Explore the research community →"}
        </Link>
      ) : null}
    </section>
  );
}
