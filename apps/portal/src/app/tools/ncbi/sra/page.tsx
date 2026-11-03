import type { Metadata } from "next";
import Link from "next/link";
import { NcbiSraForm } from "@/components/ncbi-sra-form";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "NCBI SRA 上传辅助",
  description: "校验 BioSample 与 SRA 模板，并生成在你自己电脑上执行的 Aspera 命令。",
};

export const dynamic = "force-dynamic";

export default async function NcbiSraPage() {
  const user = await currentUser();
  const entitled = isEntitled(user ?? undefined);
  return (
    <main className="page">
      <h1 className="page-title">NCBI SRA 上传辅助</h1>
      <p className="page-lead">
        上传一次 BioSample 和 SRA metadata，并填入本次提交要用的邮箱、账号目录和私钥路径。通过校验后直接得到 ascp 命令。科研通不代传文件，也不把私钥存下来。
      </p>
      <NcbiSraForm entitled={entitled} loggedIn={Boolean(user)} />
      <p className="form-note" style={{ marginTop: "1.25rem" }}>
        模板从 <a href="https://submit.ncbi.nlm.nih.gov/">NCBI Submission Portal</a> 下载。说明见{" "}
        <a href="https://www.ncbi.nlm.nih.gov/sra/docs/submit/">SRA 提交文档</a>。
        <br />
        <Link href="/tools">返回工具目录</Link>
      </p>
    </main>
  );
}
