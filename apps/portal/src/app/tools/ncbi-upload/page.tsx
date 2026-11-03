import type { Metadata } from "next";
import Link from "next/link";
import { NcbiUploadAssist } from "@/components/ncbi-upload-assist";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "NCBI SRA 上传协助",
  description: "填写必要元数据与本机路径，自动校验并生成 ascp 命令。",
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
        你只需填写必要信息与本机运行时路径；系统自动校验字段、对账文件名并生成 ascp 命令。密钥永不落库。
      </p>
      <NcbiUploadAssist loggedIn={Boolean(user)} entitled={entitled} />
    </main>
  );
}
