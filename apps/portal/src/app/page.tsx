const bbsUrl = process.env.NEXT_PUBLIC_BBS_URL ?? "https://bbs.keyantong.com";

export default function HomePage() {
  return (
    <main>
      <p style={{ color: "var(--muted)", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
        OPEN SCIENCE · SHARED EFFORT
      </p>
      <h1 className="brand">科研通</h1>
      <p className="tagline">
        开源共享的科研互助平台。以社区沉淀可检索知识，以规范贡献扩展工具——任何人都能出一份力，合法、可复现、可持续。
      </p>
      <div className="actions">
        <a className="btn btn-primary" href={bbsUrl}>
          进入社区
        </a>
        <a className="btn btn-ghost" href="https://github.com/AquaGrove/keyantong">
          参与贡献
        </a>
        <a className="btn btn-ghost" href="https://github.com/AquaGrove/keyantong/blob/main/docs/INDEX.md">
          开发者文档
        </a>
      </div>
      <section className="grid" aria-label="贡献路径">
        <article className="card">
          <h2>回答与互助</h2>
          <p>在论坛分享检索策略、环境排错与可复现步骤，无需先写代码。</p>
        </article>
        <article className="card">
          <h2>工具卡</h2>
          <p>提交 YAML 元数据，沉淀安装来源与常见坑，进入 catalog/tools。</p>
        </article>
        <article className="card">
          <h2>代码与服务</h2>
          <p>门户、桥接、RAG 等均在 Monorepo；小 PR、文档同步、CI 门禁。</p>
        </article>
      </section>
      <p className="foot">
        Licensed under <a href="https://www.apache.org/licenses/LICENSE-2.0">Apache-2.0</a>
        {" · "}
        <a href="https://github.com/AquaGrove/keyantong/blob/main/CONTRIBUTING.md">
          CONTRIBUTING
        </a>
      </p>
    </main>
  );
}
