import { AdminShell } from "@/components/admin-shell";
import {
  checkSelfHealth,
  checkUpstreamHealth,
  fetchRecentCommits,
  fetchRepoSummary,
  getGithubUrl,
  getSiteUrl,
} from "@keyantong/ops-shared";

export const dynamic = "force-dynamic";

function formatTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN");
}

export default async function OverviewPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE;
  const ragBase = process.env.NEXT_PUBLIC_RAG_BASE;
  const bbs = process.env.NEXT_PUBLIC_BBS_URL;
  const portalUrl = getSiteUrl();

  const [repo, commits, portal, bridge, rag, forum] = await Promise.all([
    fetchRepoSummary(),
    fetchRecentCommits(8),
    checkUpstreamHealth("客户端 Portal", portalUrl),
    checkUpstreamHealth(
      "Bridge",
      apiBase ? `${apiBase.replace(/\/$/, "")}/health` : undefined,
    ),
    checkUpstreamHealth(
      "RAG",
      ragBase ? `${ragBase.replace(/\/$/, "")}/health` : undefined,
    ),
    checkUpstreamHealth(
      "论坛",
      bbs && !bbs.includes("localhost") ? bbs : undefined,
    ),
  ]);

  const self = await checkSelfHealth("管理端 Admin");
  const health = [self, portal, bridge, rag, forum];

  return (
    <AdminShell>
      <h1>总览</h1>
      <p className="lead">
        仓库与服务一览。客户端公网：{portalUrl}；源码：{getGithubUrl()}。
      </p>

      <div className="stats">
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
          <span className="value" style={{ fontSize: "0.95rem" }}>
            {formatTime(repo?.pushed_at)}
          </span>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>最近提交</h2>
          {!commits?.length ? (
            <p className="mono">暂无数据或 API 限流。</p>
          ) : (
            <ul className="feed">
              {commits.map((c) => (
                <li key={c.sha}>
                  <a href={c.html_url}>{c.commit.message.split("\n")[0]}</a>
                  <div className="mono">
                    {c.sha.slice(0, 7)} · {formatTime(c.commit.author?.date)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>服务灯</h2>
          <ul className="health">
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
        </section>
      </div>
    </AdminShell>
  );
}
