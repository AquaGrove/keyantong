import type { Metadata } from "next";
import Link from "next/link";
import { RnaseqRunner } from "@/components/rnaseq-runner";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "转录组一键下游分析",
  description: "上传表达矩阵，用彩色分组卡配置多样本对照/实验，自动 DE、可视化与灵活维恩。",
};

export const dynamic = "force-dynamic";

export default async function RnaseqToolPage() {
  const user = await currentUser();
  const entitled = user ? isEntitled(user) : false;

  return (
    <main className="page">
      <p className="mono">
        <Link href="/tools">← 工具目录</Link>
      </p>
      <h1 className="page-title">转录组一键下游分析</h1>
      <p className="page-lead">
        只需提供<strong>表达矩阵</strong>，在页面上用<strong>分组卡片</strong>（颜色、角色、样本芯片）配置对照与多个实验组。
        系统自动跑多对比差异分析、PCA、火山图、热图，以及上调/下调与多组维恩；有物种注释时再做 GO/KEGG。
      </p>
      <RnaseqRunner loggedIn={Boolean(user)} entitled={entitled} />
      <section className="section" style={{ marginTop: "1.5rem" }}>
        <h2>本地 CLI（开发 / 离线）</h2>
        <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
{`cd services/rnaseq-pipeline
./smoke.sh
# 多组 JSON 配置
PYTHONPATH=. python3 -m keyantong_rnaseq \\
  --matrix fixtures/tiny_matrix.csv \\
  --groups fixtures/tiny_analysis.json \\
  --outdir /tmp/rnaseq-out --species none`}
        </pre>
      </section>
    </main>
  );
}
