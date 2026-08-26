import type { Metadata } from "next";
import Link from "next/link";
import {
  GITHUB_CONTRIBUTING_URL,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_DOCS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  title: "社区",
  description: "科研通社区入口：讨论、提问、贡献与文档。",
};

export default function CommunityPage() {
  return (
    <main className="page">
      <h1 className="page-title">社区</h1>
      <p className="page-lead">
        在这里提问、分享检索策略与环境排错经验。独立论坛上线前，互动先走 GitHub；论坛就绪后本入口会自动切换。
      </p>

      <div className="note-banner" role="note">
        当前暂用 GitHub Discussions / Issues 承接社区。欢迎先开讨论再写长文，或直接提交 Issue 跟踪问题。
      </div>

      <div className="hub-grid">
        <a className="hub-tile" href={GITHUB_DISCUSSIONS_URL}>
          <span className="tag">Discussions</span>
          <h3>开放讨论</h3>
          <p>文献策略、环境排错、经验分享。适合非代码贡献者先参与。</p>
        </a>
        <a className="hub-tile" href={GITHUB_ISSUES_URL}>
          <span className="tag">Issues</span>
          <h3>提问与缺陷</h3>
          <p>报告 bug、提需求、跟踪任务。每个问题都可被检索与关闭。</p>
        </a>
        <a className="hub-tile" href={GITHUB_CONTRIBUTING_URL}>
          <span className="tag">Contribute</span>
          <h3>参与贡献</h3>
          <p>工具卡 YAML、文档修订、代码 PR。贡献门槛分层，人人可上手。</p>
        </a>
        <a className="hub-tile" href={GITHUB_DOCS_URL}>
          <span className="tag">Docs</span>
          <h3>开发者文档</h3>
          <p>愿景、架构、ADR 与本地开发指南，读完即可开工。</p>
        </a>
      </div>

      <section className="section" style={{ marginTop: "1.25rem" }}>
        <h2>下一步</h2>
        <p className="section-lead">浏览工具卡，或回到首页了解项目。</p>
        <div className="actions">
          <a className="btn btn-primary" href={GITHUB_URL}>
            打开 GitHub
          </a>
          <Link className="btn btn-secondary" href="/tools">
            浏览工具
          </Link>
          <Link className="btn btn-secondary" href="/">
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
