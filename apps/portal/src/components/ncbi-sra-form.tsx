"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Plan = {
  samples: number;
  files: string[];
  ascpCommand: string;
  script: string;
};

export function NcbiSraForm({ entitled, loggedIn }: { entitled: boolean; loggedIn: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!entitled) return;
    setBusy(true);
    setErr("");
    const res = await fetch("/api/tools/ncbi/sra/prepare", { method: "POST", body: new FormData(e.currentTarget) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setPlan(null);
      setErr(data.error || "校验失败");
      return;
    }
    setPlan(data);
  }

  function downloadScript() {
    if (!plan) return;
    const blob = new Blob([plan.script], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "upload.sh";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {!loggedIn ? (
        <p className="rules-banner">
          生成上传命令需要校园账号。<Link href="/login"> 登录</Link>
        </p>
      ) : null}
      {loggedIn && !entitled ? (
        <p className="rules-banner">
          试用已结束。<Link href="/pricing"> 查看会员说明</Link>
        </p>
      ) : null}
      <form className="help-form" onSubmit={onSubmit} style={{ maxWidth: "46rem" }}>
        <label>
          BioSample 属性表（官方模板另存为 TSV）
          <input name="biosample" type="file" accept=".tsv,.csv,.txt,.tab" required disabled={!entitled || busy} />
        </label>
        <label>
          SRA metadata（官方模板另存为 TSV）
          <input name="sra" type="file" accept=".tsv,.csv,.txt,.tab" required disabled={!entitled || busy} />
        </label>
        <label>
          提交者邮箱
          <input name="email" type="email" required disabled={!entitled || busy} placeholder="name@university.edu" />
        </label>
        <label>
          Aspera 账号目录
          <input name="account" required disabled={!entitled || busy} placeholder="account-folder" />
        </label>
        <label>
          本次预传子目录
          <input name="preload" required disabled={!entitled || busy} placeholder="preload-1" />
        </label>
        <label>
          本机私钥绝对路径（只用来填进命令，不上传文件内容）
          <input name="keyPath" disabled={!entitled || busy} placeholder="/home/you/aspera.openssh" />
        </label>
        <label>
          本机数据目录绝对路径
          <input name="dataDir" disabled={!entitled || busy} placeholder="/home/you/fastq" />
        </label>
        <p className="form-note">
          提交后会检查必填列、样本是否对齐、文件名是否为 fastq.gz / bz2。通过后给出可在你电脑上执行的 ascp 命令。服务器不登录 NCBI，不接收 FASTQ，不保存私钥。
        </p>
        <button className="btn btn-primary" type="submit" disabled={!entitled || busy}>
          {busy ? "正在校验…" : "校验并生成上传命令"}
        </button>
      </form>
      {err ? <p className="rules-banner">{err}</p> : null}
      {plan ? (
        <section className="section" style={{ marginTop: "1.25rem" }}>
          <h2>可以上传</h2>
          <p className="form-note">
            {plan.samples} 个样本，{plan.files.length} 个文件。命令只在这次响应里返回，没有写入服务器磁盘。
          </p>
          <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
            {plan.ascpCommand}
          </pre>
          <div className="pca-downloads">
            <button className="btn btn-secondary" type="button" onClick={downloadScript}>
              下载 upload.sh
            </button>
          </div>
          <ul className="check-list">
            {plan.files.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
