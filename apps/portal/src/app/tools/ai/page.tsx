import type { Metadata } from "next";
import Link from "next/link";
import { AiAssistant } from "@/components/ai-assistant";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "AI 助手",
  description: "科研通业务 LLM 网关：场景化问答、双账本额度；密钥仅服务端持有。",
};

export const dynamic = "force-dynamic";

export default async function AiToolPage() {
  const user = await currentUser();
  const entitled = user ? isEntitled(user) : false;

  return (
    <main className="page">
      <p className="page-crumb">
        <Link href="/tools">← 工具目录</Link>
      </p>
      <div className="module-hero">
        <p className="page-kicker">LLM Gateway</p>
        <h1 className="page-title">AI 助手</h1>
        <p className="page-lead">
          面向登录会员的场景化科研助手：FAQ、工具说明与排错草稿。供应商 Key 只在服务端；
          测序大文件与 NCBI 上传仍走既有安全边界。
        </p>
      </div>
      <AiAssistant loggedIn={Boolean(user)} entitled={entitled} />
    </main>
  );
}
