"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { POST_KINDS, type PublicPost } from "@/lib/community/types";
export function ResearchPostDetail({
  initial,
  loggedIn,
}: {
  initial: PublicPost;
  loggedIn: boolean;
}) {
  const [post, setPost] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function mutate(body: Record<string, unknown>, method: string) {
    const r = await fetch(`/api/community/posts/${post.id}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "操作失败");
    setPost(data.post);
  }
  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await mutate({ body: data.get("body"), url: data.get("url") }, "POST");
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "响应失败");
    } finally {
      setBusy(false);
    }
  }
  async function accept(responseId: string | null) {
    setBusy(true);
    setError("");
    try {
      await mutate({ responseId }, "PATCH");
    } catch (e) {
      setError(e instanceof Error ? e.message : "采纳失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <article className="section research-detail">
        <p className="page-kicker">
          {POST_KINDS[post.kind]}
          {post.topic ? ` / ${post.topic}` : ""}
        </p>
        <h1 className="page-title">{post.title}</h1>
        <p className="post-meta">
          {post.authorLabel} ·{" "}
          {new Date(post.createdAt).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
          })}
          {post.acceptedResponseId ? " · 已获帮助" : ""}
        </p>
        {post.doi ? (
          <div className="literature-reference">
            <strong>文献线索</strong>
            <p>{post.doi}</p>
            <Link
              className="linkish"
              href={`/papers?q=${encodeURIComponent(post.doi)}`}
            >
              在文献网络中探索 ↗
            </Link>
          </div>
        ) : null}
        <div className="post-body">{post.body}</div>
      </article>
      <section className="section">
        <h2>{post.responseCount} 条响应</h2>
        {post.responses.length ? (
          <div className="response-list">
            {post.responses.map((r) => (
              <article
                className={`research-response ${post.acceptedResponseId === r.id ? "is-accepted" : ""}`}
                key={r.id}
              >
                <div className="post-byline">
                  <strong>{r.authorLabel}</strong>
                  <span className="post-meta">
                    {new Date(r.createdAt).toLocaleDateString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                    })}
                  </span>
                  {post.acceptedResponseId === r.id ? (
                    <span className="resolved-label">已采纳</span>
                  ) : null}
                </div>
                <p className="post-body">{r.body}</p>
                {r.url ? (
                  <a
                    className="linkish"
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看分享的链接 ↗
                  </a>
                ) : null}
                {post.isOwner &&
                ["literature", "question", "collaboration"].includes(
                  post.kind,
                ) ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="btn btn-secondary"
                    onClick={() =>
                      void accept(
                        post.acceptedResponseId === r.id ? null : r.id,
                      )
                    }
                  >
                    {post.acceptedResponseId === r.id
                      ? "取消采纳"
                      : "采纳这条响应"}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="section-lead">
            还没有响应。如果你有相关经验，欢迎分享你的思路。
          </p>
        )}
        {error ? (
          <p role="alert" className="ai-error">
            {error}
          </p>
        ) : null}
        {loggedIn ? (
          <form className="help-form" onSubmit={reply}>
            <label>
              我的响应
              <textarea
                name="body"
                rows={4}
                maxLength={4000}
                required
                placeholder={
                  post.kind === "literature"
                    ? "分享 OA、机构库、作者稿链接，或说明可复现的检索步骤。"
                    : "一条思路、一次相似经历、一个解决方法，都可以帮助对方。"
                }
              />
            </label>
            <label>
              参考链接（选填）
              <input
                type="url"
                name="url"
                maxLength={2000}
                placeholder="https://…"
              />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "提交中…" : "贡献我的一份力"}
            </button>
          </form>
        ) : (
          <p className="section-lead">
            <Link className="linkish" href="/login">
              登录后响应
            </Link>{" "}
            · 分享与响应不需要会员。
          </p>
        )}
      </section>
    </>
  );
}
