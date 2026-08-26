import { AdminShell } from "@/components/admin-shell";
import {
  fetchOpenIssues,
  fetchOpenPulls,
  fetchRecentCommits,
  getGithubUrl,
} from "@keyantong/ops-shared";

export const dynamic = "force-dynamic";

function formatTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN");
}

export default async function GithubPage() {
  const [commits, pulls, issues] = await Promise.all([
    fetchRecentCommits(20),
    fetchOpenPulls(15),
    fetchOpenIssues(15),
  ]);

  return (
    <AdminShell>
      <h1>GitHub</h1>
      <p className="lead">
        跟踪贡献与协作。仓库：
        <a href={getGithubUrl()}>{getGithubUrl()}</a>
      </p>

      <div className="grid-2">
        <section className="panel">
          <h2>提交流</h2>
          {!commits?.length ? (
            <p className="mono">暂无数据。</p>
          ) : (
            <ul className="feed">
              {commits.map((c) => (
                <li key={c.sha}>
                  <a href={c.html_url}>{c.commit.message.split("\n")[0]}</a>
                  <div className="mono">
                    {c.sha.slice(0, 7)} · {c.author?.login ?? "unknown"} ·{" "}
                    {formatTime(c.commit.author?.date)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div style={{ display: "grid", gap: "0.85rem" }}>
          <section className="panel">
            <h2>开放 PR</h2>
            {!pulls?.length ? (
              <p className="mono">无开放 PR。</p>
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
          <section className="panel">
            <h2>开放 Issue</h2>
            {!issues?.length ? (
              <p className="mono">无开放 Issue。</p>
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
    </AdminShell>
  );
}
