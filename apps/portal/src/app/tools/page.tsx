import type { Metadata } from "next";
import Link from "next/link";
import { ToolsCatalog } from "@/components/tools-catalog";
import { loadToolCards } from "@/lib/catalog";
import { GITHUB_CONTRIBUTING_URL, GITHUB_URL } from "@/lib/site";
import { PageDecor } from "@/components/page-decor";

export const metadata: Metadata = {
  title: "工具",
  description: "科研通工具目录：安装来源、常见坑与社区贡献的工具卡。",
};

export default function ToolsPage() {
  const tools = loadToolCards().filter((t) => t.id !== "example-tool");

  return (
    <main className="page">
      <PageDecor variant="tools" />
      <div className="module-hero">
        <p className="page-kicker">Tools</p>
        <h1 className="page-title">工具目录</h1>
        <p className="page-lead">
          社区沉淀的软件卡片：合法安装来源、环境提示与常见坑。欢迎按贡献指南提交新的 YAML 工具卡。
        </p>
      </div>

      <section className="section">
        <h2>可在线运行</h2>
        <p className="section-lead">矩阵+分组一键分析、NCBI 本机上传协助、场景化 AI 助手（需登录且具备会员权益）。</p>
        <div className="hub-grid" style={{ marginBottom: "1rem" }}>
          <Link className="hub-tile" href="/tools/rnaseq">
            <span className="tag">RNAseq</span>
            <h3>转录组一键下游</h3>
            <p>表达矩阵 + 彩色分组卡，自动 DE / 可视化 / 维恩；大任务可交 worker。</p>
          </Link>
          <Link className="hub-tile" href="/tools/ncbi-upload">
            <span className="tag">NCBI</span>
            <h3>SRA 上传协助</h3>
            <p>元数据校验与本机 ascp 命令；测序文件不经过科研通服务器。</p>
          </Link>
          <Link className="hub-tile" href="/tools/ai">
            <span className="tag">AI</span>
            <h3>AI 助手</h3>
            <p>业务 LLM 网关：FAQ / 工具说明 / 排错；双账本额度，Key 不出浏览器。</p>
          </Link>
        </div>
        <div className="actions">
          <Link className="btn btn-primary" href="/tools/rnaseq">
            打开 RNAseq
          </Link>
          <Link className="btn btn-secondary" href="/tools/ncbi-upload">
            打开 NCBI
          </Link>
          <Link className="btn btn-secondary" href="/tools/ai">
            打开 AI 助手
          </Link>
        </div>
      </section>

      {tools.length === 0 ? (
        <section className="section">
          <p className="mono">暂未读到 catalog/tools 下的工具卡。</p>
        </section>
      ) : (
        <section className="section">
          <h2>社区工具卡</h2>
          <p className="section-lead">按分类浏览；带门户路径的卡片可直接在线打开。</p>
          <ToolsCatalog tools={tools} />
        </section>
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
