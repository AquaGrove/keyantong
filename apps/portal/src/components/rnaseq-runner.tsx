"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  status: string;
  error?: string;
  summary?: {
    n_genes?: number;
    n_samples?: number;
    n_up?: number;
    n_down?: number;
    control_label?: string;
    treatment_label?: string;
    enrichment?: string;
  };
};

export function RnaseqRunner({ entitled, loggedIn }: { entitled: boolean; loggedIn: boolean }) {
  const [matrix, setMatrix] = useState<File | null>(null);
  const [groups, setGroups] = useState<File | null>(null);
  const [species, setSpecies] = useState("none");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [job, setJob] = useState<Job | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setJob(null);
    if (!loggedIn) {
      setErr("请先登录校园账号");
      return;
    }
    if (!entitled) {
      setErr("需要有效试用或永久会员后才能运行分析");
      return;
    }
    if (!matrix || !groups) {
      setErr("请同时选择表达矩阵与分组表");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("matrix", matrix);
      fd.set("groups", groups);
      fd.set("species", species);
      const res = await fetch("/api/tools/rnaseq", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok && !data.job) {
        setErr(data.error || "提交失败");
        return;
      }
      setJob(data.job);
      if (data.job?.status === "failed") setErr(data.job.error || "分析失败");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {!loggedIn ? (
        <p className="rules-banner">
          请先 <Link href="/login">登录</Link> / <Link href="/register">注册试用</Link>。
        </p>
      ) : !entitled ? (
        <p className="rules-banner">
          当前账号无权运行分析。请确认校园认证与会员状态，见 <Link href="/account">我的账户</Link>。
        </p>
      ) : null}

      <form className="help-form" onSubmit={onSubmit}>
        <label>
          表达矩阵（CSV/TSV，首列 gene_id，其余为样本列）
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            required
            onChange={(e) => setMatrix(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          分组表（CSV/TSV，列：sample,group；group 为 control/treatment 或对照/实验）
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            required
            onChange={(e) => setGroups(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          物种注释（无可注解时保持 none；GO/KEGG 将自动跳过并在结果中说明）
          <input value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="none" />
        </label>
        <p className="form-note">
          主路径<strong>只需要以上两类输入</strong>。差异分析、PCA、火山图、热图、上下调对照由系统自动完成并打包。
        </p>
        {err ? <p className="rules-banner">{err}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy || !loggedIn || !entitled}>
          {busy ? "分析中…" : "一键分析"}
        </button>
      </form>

      {job ? (
        <section className="section" style={{ marginTop: "1.25rem" }}>
          <h2>任务状态</h2>
          <p className="mono">
            id={job.id} · status={job.status}
            {job.summary
              ? ` · genes=${job.summary.n_genes ?? "?"} samples=${job.summary.n_samples ?? "?"} up=${job.summary.n_up ?? "?"} down=${job.summary.n_down ?? "?"} contrast=${job.summary.control_label || "?"}→${job.summary.treatment_label || "?"} enrichment=${job.summary.enrichment || "?"}`
              : null}
          </p>
          {job.status === "succeeded" ? (
            <div className="actions" style={{ marginTop: "0.75rem" }}>
              <a className="btn btn-primary" href={`/api/tools/rnaseq/${job.id}/download`}>
                下载结果包 ZIP
              </a>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
