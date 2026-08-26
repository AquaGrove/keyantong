import type { Metadata } from "next";
import Link from "next/link";
import { loadToolCards } from "@/lib/catalog";
import { GITHUB_CONTRIBUTING_URL, GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "工具",
  description: "科研通工具目录：安装来源、常见坑与社区贡献的工具卡。",
};

export default function ToolsPage() {
  const tools = loadToolCards();

  return (
    <main className="page">
      <h1 className="page-title">工具目录</h1>
      <p className="page-lead">
        社区沉淀的软件卡片：合法安装来源、环境提示与常见坑。欢迎按贡献指南提交新的 YAML 工具卡。
      </p>

      {tools.length === 0 ? (
        <section className="section">
          <p className="mono">暂未读到 catalog/tools 下的工具卡。</p>
        </section>
      ) : (
        <div className="hub-grid">
          {tools.map((t) => (
            <article key={t.id} className="hub-tile" style={{ cursor: "default" }}>
              <span className="tag">{t.categories?.join(" · ") || "tool"}</span>
              <h3>{t.name}</h3>
              <p>{t.summary}</p>
              <p className="mono" style={{ marginTop: "0.75rem" }}>
                {t.license ? `License ${t.license}` : null}
                {t.author ? ` · ${t.author}` : null}
                {t.docsUrl ? (
                  <>
                    {" · "}
                    <a href={t.docsUrl}>文档</a>
                  </>
                ) : null}
              </p>
            </article>
          ))}
        </div>
      )}

      <section className="section" style={{ marginTop: "1.25rem" }}>
        <h2>提交工具卡</h2>
        <p className="section-lead">
          复制 <code className="mono">catalog/tools/example-tool.yaml</code>，填写后发 PR 即可。
        </p>
        <div className="actions">
          <a className="btn btn-primary" href={`${GITHUB_URL}/tree/main/catalog/tools`}>
            查看 catalog
          </a>
          <a className="btn btn-secondary" href={GITHUB_CONTRIBUTING_URL}>
            贡献指南
          </a>
          <Link className="btn btn-secondary" href="/community">
            去社区讨论
          </Link>
        </div>
      </section>
    </main>
  );
}
