import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_DOCS_URL, GITHUB_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "关于",
  description: "科研通愿景、合规原则与开源许可。",
};

export default function AboutPage() {
  return (
    <main className="page">
      <h1 className="page-title">关于科研通</h1>
      <p className="page-lead">
        科研通是面向科研人员的开源互助平台：社区沉淀可检索知识，规范贡献扩展工具，合规优先、人人可参与。
      </p>

      <section className="section">
        <h2>我们坚持</h2>
        <ul className="pulse-list">
          <li>
            <span className="mono">01</span>
            <span>开源共享：主仓库 Apache-2.0，贡献默认同许可</span>
            <span />
          </li>
          <li>
            <span className="mono">02</span>
            <span>分层贡献：回答 → 工具卡 → 文档 → 代码，门槛递增</span>
            <span />
          </li>
          <li>
            <span className="mono">03</span>
            <span>合规优先：文献互助只谈合法 / OA 路径，不做盗版分发</span>
            <span />
          </li>
          <li>
            <span className="mono">04</span>
            <span>可复现：强调环境、版本与步骤，而不是一次性私聊答案</span>
            <span />
          </li>
        </ul>
      </section>

      <section className="section" style={{ marginTop: "1.25rem" }}>
        <h2>深入了解</h2>
        <p className="section-lead">完整产品与架构说明在开发者文档中。</p>
        <div className="actions">
          <a className="btn btn-primary" href={GITHUB_DOCS_URL}>
            开发者文档
          </a>
          <a className="btn btn-secondary" href={GITHUB_URL}>
            GitHub 仓库
          </a>
          <Link className="btn btn-secondary" href="/community">
            加入社区
          </Link>
        </div>
      </section>
    </main>
  );
}
