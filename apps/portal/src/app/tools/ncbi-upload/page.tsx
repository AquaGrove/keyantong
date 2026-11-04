import type { Metadata } from "next";
import Link from "next/link";
import { NcbiUploadAssist } from "@/components/ncbi-upload-assist";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "NCBI SRA 上传协助",
  description: "门户只做元数据校验与本机命令生成；测序文件在用户本机经 ascp 直连 NCBI，不经过科研通服务器。",
};

export const dynamic = "force-dynamic";

export default async function NcbiUploadPage() {
  const user = await currentUser();
  const entitled = user ? isEntitled(user) : false;

  return (
    <main className="page">
      <p className="mono">
        <Link href="/tools">← 工具目录</Link>
      </p>
      <h1 className="page-title">NCBI SRA 上传协助</h1>
      <p className="page-lead">
        网站提供入口与校验；<strong>自动上传发生在你的电脑上</strong>。测序大数据不经过科研通服务器（资源也不够中转）。
        你填写元数据与本机路径 → 生成 ascp 命令 / 本地助手脚本 → 本机直连 NCBI。密钥永不落库。
      </p>
      <NcbiUploadAssist loggedIn={Boolean(user)} entitled={entitled} />
    </main>
  );
}
