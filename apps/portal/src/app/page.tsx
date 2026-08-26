import Link from "next/link";
import { fetchRecentCommits } from "@/lib/github";
import { GITHUB_URL } from "@/lib/site";

export default async function HomePage() {
  const commits = (await fetchRecentCommits(5)) ?? [];

  return (
    <main className="page">
      <section className="hero" aria-label="科研通介绍">
        <div className="hero-copy">
          <p className="kicker">Open science · Shared effort</p>
          <h1 className="brand">科研通</h1>
          <p className="lead">
            需要一篇文献？在社区发求助帖，让同伴帮你找到
            <strong>合法获取路径</strong>
            （OA、馆藏、作者稿）——不是互相传 PDF，而是可复现的检索与合规渠道。
          </p>
          <div className="actions">
            <Link className="btn btn-primary" href="/community#ask">
              发起文献求助
            </Link>
            <Link className="btn btn-secondary" href="/community#answer">
              去帮助别人
            </Link>
            <Link className="btn btn-secondary" href="/tools">
              浏览工具
            </Link>
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
            每一次提问、回答与工具沉淀，都连成可复用的知识节点。
          </p>
        </div>
      </section>

      <section className="section" aria-label="社区动态">
        <h2>社区动态</h2>
        <p className="section-lead">
          来自开源仓库的最新公开更新。想提问或分享经验？先去{" "}
          <Link href="/community">社区</Link>
          ；找软件与环境模板？看{" "}
          <Link href="/tools">工具目录</Link>。源码在{" "}
          <a href={GITHUB_URL}>GitHub</a>。
        </p>
        {commits.length === 0 ? (
          <p className="mono">暂时无法拉取公开动态，请稍后再试。</p>
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
