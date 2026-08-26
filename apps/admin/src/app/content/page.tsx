import { AdminShell } from "@/components/admin-shell";
import {
  fetchIssuesByLabel,
  fetchOpenIssues,
  getGithubIssuesUrl,
  getGithubUrl,
} from "@keyantong/ops-shared";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const [moderation, openIssues] = await Promise.all([
    fetchIssuesByLabel("moderation", 10),
    fetchOpenIssues(10),
  ]);

  return (
    <AdminShell>
      <h1>内容治理</h1>
      <p className="lead">
        论坛 API 就绪前，用 GitHub Issue 标签承接审核。建议标签：
        <code className="mono"> moderation </code>、
        <code className="mono"> needs-triage </code>。
      </p>

      <div className="grid-2">
        <section className="panel">
          <h2>待审（label: moderation）</h2>
          {!moderation?.length ? (
            <p className="mono">暂无 moderation 标签 Issue。可在仓库手动打标签。</p>
          ) : (
            <ul className="feed">
              {moderation.map((i) => (
                <li key={i.number}>
                  <a href={i.html_url}>
                    #{i.number} {i.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>开放 Issue 快览</h2>
          {!openIssues?.length ? (
            <p className="mono">暂无开放 Issue。</p>
          ) : (
            <ul className="feed">
              {openIssues.map((i) => (
                <li key={i.number}>
                  <a href={i.html_url}>
                    #{i.number} {i.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="mono" style={{ marginTop: "0.75rem" }}>
            <a href={getGithubIssuesUrl()}>{getGithubIssuesUrl()}</a>
          </p>
        </section>
      </div>

      <section className="panel" style={{ marginTop: "0.85rem" }}>
        <h2>占位说明</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          NodeBB 上线后，此处将接入举报队列、封禁与版块管理 API。当前请在{" "}
          <a href={getGithubUrl()}>GitHub</a> 完成社区互动处置。
        </p>
      </section>
    </AdminShell>
  );
}
