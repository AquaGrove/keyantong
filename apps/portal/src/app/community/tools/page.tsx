import type { Metadata } from "next";
import Link from "next/link";
import { ToolShareBoard } from "@/components/tool-share-board";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "工具分享与求助",
  description: "分享合法授权的科研工具外链，或发起工具求助；可搜索检索，形成互助闭环。",
};

export const dynamic = "force-dynamic";

export default async function CommunityToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const user = await currentUser();
  const entitled = isEntitled(user ?? undefined);
  const initialTab = sp.tab === "help" ? "help" : "share";

  return (
    <main className="page">
      <h1 className="page-title">工具分享与求助</h1>
      <p className="page-lead">
        发现好用的科研工具？分享<strong>下载/官网链接 + 功能描述</strong>。有类似需求的人可搜索检索直接使用；
        搜不到就发求助，同伴看到后可以发分享并标记解决——一起变成互动交流、学习成长的平台。
        文献 PDF 合规互助仍在{" "}
        <Link href="/community#ask">社区 · 文献互助</Link>。
      </p>
      <ToolShareBoard
        entitled={entitled}
        initialTab={initialTab}
        initialQuery={sp.q || ""}
      />
    </main>
  );
}
