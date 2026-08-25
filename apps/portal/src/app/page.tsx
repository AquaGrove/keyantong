import Link from "next/link";
import { fetchRecentCommits } from "@/lib/github";
import {
  GITHUB_DOCS_URL,
  GITHUB_URL,
  getCommunityHref,
} from "@/lib/site";

export default async function HomePage() {
  const communityHref = getCommunityHref();
  const commits = (await fetchRecentCommits(5)) ?? [];

  return (
    <main className="page">
      <section className="hero" aria-label="科研通介绍">
        <div className="hero-copy">
          <p className="kicker">Open science · Shared effort</p>
          <h1 className="brand">科研通</h1>
          <p className="lead">
            面向科研人员的开源互助站：把文献策略、环境排错与可复现步骤留在社区，用规范贡献扩展工具——合法、可检索、可持续。
          </p>
          <div className="actions">
            <a className="btn btn-primary" href={communityHref}>
              进入社区
            </a>
            <Link className="btn btn-secondary" href="/monitor">
              打开监测台
            </Link>
            <a className="btn btn-secondary" href={GITHUB_URL}>
              GitHub 仓库
            </a>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="constellation">
            <span className="node" />
            <span className="node" />
            <span className="node" />
            <span className="node" />
            <span className="node" />
            <span
              className="link-line"
              style={{ top: "26%", left: "30%", width: "28%", transform: "rotate(18deg)" }}
            />
            <span
              className="link-line"
              style={{ top: "44%", left: "40%", width: "34%", transform: "rotate(-12deg)" }}
            />
            <span
              className="link-line"
              style={{ top: "58%", left: "38%", width: "32%", transform: "rotate(28deg)" }}
            />
          </div>
          <p className="visual-caption">
            <strong>协作网络正在生长</strong>
            每一次提问、回答与代码贡献，都连成可复用的知识节点。
          </p>
        </div>
      </section>

      <section className="section" aria-label="最近仓库动态">
        <h2>仓库脉搏</h2>
        <p className="section-lead">
          最新提交来自 GitHub 公开仓库。完整互动、Issue / PR 与服务健康见
          <Link href="/monitor"> 监测台</Link>
          ；开发说明见{" "}
          <a href={GITHUB_DOCS_URL}>文档</a>。
        </p>
        {commits.length === 0 ? (
          <p className="mono">暂时无法拉取 GitHub 动态，请稍后在监测台重试。</p>
        ) : (
          <ul className="pulse-list">
            {commits.map((c) => {
              const title = c.commit.message.split("\n")[0];
              const when = c.commit.author?.date
                ? new Date(c.commit.author.date).toLocaleString("zh-CN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
              return (
                <li key={c.sha}>
                  <span className="mono">{c.sha.slice(0, 7)}</span>
                  <a href={c.html_url}>{title}</a>
                  <span className="mono">{when}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
