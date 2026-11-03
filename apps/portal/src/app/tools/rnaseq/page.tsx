import type { Metadata } from "next";
import Link from "next/link";
import { RnaseqAnalysisForm } from "@/components/rnaseq-analysis-form";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "转录组分析",
  description: "上传表达矩阵并标好对照和处理组，自动完成差异分析、PCA、火山图、热图和可选富集。",
};

export const dynamic = "force-dynamic";

export default async function RnaseqPage() {
  const user = await currentUser();
  const entitled = isEntitled(user ?? undefined);
  return (
    <main className="page">
      <h1 className="page-title">转录组分析</h1>
      <p className="page-lead">
        只需要基因表达矩阵，以及哪些列是对照、哪些列是处理组。质控、log2 变换、差异分析、PCA、火山图、热图和多处理组韦恩图会一起算完。GO / KEGG 使用服务器上的物种注释库，不会让你再传富集表。
      </p>
      <div className="flow">
        <div className="flow-step">
          <span className="flow-num">1</span>
          <div>
            <strong>矩阵</strong>
            <p>基因 ID 加每个样本一列的 TPM 或 FPKM</p>
          </div>
        </div>
        <div className="flow-step">
          <span className="flow-num">2</span>
          <div>
            <strong>分组</strong>
            <p>在页面上把样本列标成对照或处理组</p>
          </div>
        </div>
        <div className="flow-step">
          <span className="flow-num">3</span>
          <div>
            <strong>结果包</strong>
            <p>差异表、图和 zip 一次给出</p>
          </div>
        </div>
      </div>
      <RnaseqAnalysisForm entitled={entitled} loggedIn={Boolean(user)} />
      <p className="form-note" style={{ marginTop: "1.25rem" }}>
        <Link href="/tools">返回工具目录</Link>
      </p>
    </main>
  );
}
