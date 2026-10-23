import type { Metadata } from "next";
import { PapersExplorer } from "@/components/papers-explorer";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "文献关系网",
  description: "以种子文献展开引用与被引邻域，数据来自 OpenAlex。",
};

export const dynamic = "force-dynamic";

export default async function PapersPage() {
  const user = await currentUser();
  const entitled = isEntitled(user ?? undefined);

  return (
    <main className="page">
      <h1 className="page-title">文献关系网</h1>
      <p className="page-lead">
        输入一篇论文，查看它引用了谁、又被谁引用。交互参考 Connected Papers /
        ResearchRabbit / Litmaps 的「种子 → 邻域」思路，数据只用公开的 OpenAlex，不镜像那三家产品。
      </p>
      <div className="flow">
        <div className="flow-step">
          <span className="flow-num">1</span>
          <div>
            <strong>种子</strong>
            <p>DOI 或题名定位一篇论文</p>
          </div>
        </div>
        <div className="flow-step">
          <span className="flow-num">2</span>
          <div>
            <strong>更早 / 更新</strong>
            <p>内圈参考文献，外圈高被引后续工作</p>
          </div>
        </div>
        <div className="flow-step">
          <span className="flow-num">3</span>
          <div>
            <strong>合法获取</strong>
            <p>优先 OA；没有则去社区求助路径</p>
          </div>
        </div>
      </div>
      <PapersExplorer entitled={entitled} />
    </main>
  );
}
