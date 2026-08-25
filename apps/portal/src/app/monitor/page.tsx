import type { Metadata } from "next";
import Link from "next/link";
import {
  checkPortalHealth,
  checkUpstreamHealth,
  fetchOpenIssues,
  fetchOpenPulls,
  fetchRecentCommits,
  fetchRepoSummary,
} from "@/lib/github";
import { GITHUB_URL, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "监测台",
  description: "科研通项目监测：GitHub 贡献、Issue/PR 与服务健康。",
};

export const dynamic = "force-dynamic";

function formatTime(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MonitorPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE;
  const bbs = process.env.NEXT_PUBLIC_BBS_URL;

  const [repo, commits, pulls, issues, portal, bridge, forum] = await Promise.all([
    fetchRepoSummary(),
    fetchRecentCommits(15),
    fetchOpenPulls(8),
    fetchOpenIssues(8),
    checkPortalHealth(),
    checkUpstreamHealth(
      "Bridge API",
      apiBase ? `${apiBase.replace(/\/$/, "")}/health` : undefined,
    ),
    checkUpstreamHealth("论坛入口", bbs && !bbs.includes("localhost") ? bbs : undefined),
  ]);

  const health = [portal, bridge, forum];

  return (
    <main className="page">
      <h1 className="page-title">监测台</h1>
      <p className="page-lead">
        同步 GitHub 贡献与站点健康，方便你在用户增多后及时跟进互动与发版。数据约每分钟刷新；可配置{" "}
        <code className="mono">GITHUB_TOKEN</code> 提高 API 限额。
      </p>

      <div className="stats" aria-label="仓库概览">
        <div className="stat">
          <span className="label">Stars</span>
          <span className="value">{repo?.stargazers_count ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="label">Forks</span>
          <span className="value">{repo?.forks_count ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="label">Open issues</span>
          <span className="value">{repo?.open_issues_count ?? "—"}</span>
        </div>
        <div className="stat">
          <span className="label">最近推送</span>
          <span className="value" style={{ fontSize: "1.05rem", lineHeight: 1.35 }}>
            {formatTime(repo?.pushed_at)}
          </span>
        </div>
      </div>

      <div className="panels">
        <section className="panel" aria-label="最近提交">
          <h3>最近提交</h3>
          {!commits?.length ? (
            <p className="mono">暂无数据或 GitHub API 限流。</p>
          ) : (
            <ul className="feed">
              {commits.map((c) => (
                <li key={c.sha}>
                  <a href={c.html_url}>{c.commit.message.split("\n")[0]}</a>
                  <div className="mono">
                    {c.sha.slice(0, 7)} · {c.author?.login ?? c.commit.author?.name ?? "unknown"} ·{" "}
                    {formatTime(c.commit.author?.date)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div style={{ display: "grid", gap: "1rem" }}>
          <section className="panel" aria-label="服务健康">
            <h3>服务健康</h3>
            <ul className="health-list">
              {health.map((h) => (
                <li key={h.name}>
                  <div>
                    <strong>{h.name}</strong>
                    <div className="mono">{h.detail}</div>
                  </div>
                  <span className={`badge ${h.ok ? "badge-ok" : "badge-bad"}`}>
                    {h.ok ? "OK" : "DOWN"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mono" style={{ marginTop: "0.85rem" }}>
              门户：{SITE_URL}
            </p>
          </section>

          <section className="panel" aria-label="开放 PR">
            <h3>开放 Pull Request</h3>
            {!pulls?.length ? (
              <p className="mono">当前无开放 PR。</p>
            ) : (
              <ul className="feed">
                {pulls.map((p) => (
                  <li key={p.number}>
                    <a href={p.html_url}>
                      #{p.number} {p.title}
                    </a>
                    <div className="mono">
                      @{p.user?.login} · {formatTime(p.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel" aria-label="开放 Issue">
            <h3>开放 Issue</h3>
            {!issues?.length ? (
              <p className="mono">当前无开放 Issue（或暂不可用）。</p>
            ) : (
              <ul className="feed">
                {issues.map((i) => (
                  <li key={i.number}>
                    <a href={i.html_url}>
                      #{i.number} {i.title}
                    </a>
                    <div className="mono">
                      @{i.user?.login} · {formatTime(i.created_at)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="section" style={{ marginTop: "1.25rem" }}>
        <h2>运维动作</h2>
        <p className="section-lead">
          改完本地代码 → <code className="mono">git push</code> → Zeabur 自动部署。社区互动与贡献请优先在
          GitHub 处理，再同步到站点文案与功能。
        </p>
        <div className="actions">
          <a className="btn btn-primary" href={GITHUB_URL}>
            打开仓库
          </a>
          <Link className="btn btn-secondary" href="/community">
            社区入口
          </Link>
          <Link className="btn btn-secondary" href="/">
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
