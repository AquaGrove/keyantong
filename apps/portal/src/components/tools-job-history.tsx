"use client";

import { useCallback, useEffect, useState } from "react";

type Quota = {
  soft_max_concurrent: number;
  concurrent_running: number;
  rnaseq_recent: number;
  ncbi_recent: number;
  near_limit: boolean;
  note?: string;
};

type HistJob = {
  id: string;
  kind: "rnaseq" | "ncbi";
  status: string;
  createdAt: string;
  updatedAt?: string;
  finishedAt?: string;
  message?: string;
  error?: string;
  mode?: string;
  species?: string;
  download_available?: boolean;
  download_url?: string | null;
  summary?: Record<string, unknown>;
};

function fmtTime(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }) + " (Asia/Shanghai)";
  } catch {
    return iso;
  }
}

export function ToolsJobHistory({
  entitled,
  loggedIn,
  filterKind = "all",
}: {
  entitled: boolean;
  loggedIn: boolean;
  filterKind?: "all" | "rnaseq" | "ncbi";
}) {
  const [jobs, setJobs] = useState<HistJob[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!loggedIn || !entitled) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/tools/jobs?kind=${filterKind}&limit=20`);
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "加载任务历史失败");
        return;
      }
      setJobs(data.jobs || []);
      setQuota(data.quota || null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }, [loggedIn, entitled, filterKind]);

  useEffect(() => {
    void load();
    if (!loggedIn || !entitled) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load, loggedIn, entitled]);

  if (!loggedIn) {
    return <p className="form-note">登录后可查看本人任务历史与软配额。</p>;
  }
  if (!entitled) {
    return <p className="form-note">会员权限开通后可查看任务历史。</p>;
  }

  return (
    <section className="tools-history">
      <div className="tools-history-head">
        <h2>任务历史</h2>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>
      {quota ? (
        <p className={`tools-quota${quota.near_limit ? " is-warn" : ""}`}>
          软配额：并发 {quota.concurrent_running} / {quota.soft_max_concurrent}
          （rnaseq 近 {quota.rnaseq_recent} · ncbi 近 {quota.ncbi_recent}）
          {quota.near_limit ? " · 已接近并发上限（目前仍允许提交）" : ""}
        </p>
      ) : null}
      {err ? <p className="rules-banner">{err}</p> : null}
      {!jobs.length && !loading ? <p className="form-note">暂无任务记录。</p> : null}
      {jobs.length ? (
        <div className="tools-history-table-wrap">
          <table className="tools-history-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>摘要</th>
                <th>下载</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={`${j.kind}-${j.id}`}>
                  <td className="mono">
                    {j.kind}
                    {j.mode ? `/${j.mode}` : ""}
                    {j.species ? ` · ${j.species}` : ""}
                  </td>
                  <td>
                    <span className={`tools-status tools-status-${j.status}`}>{j.status}</span>
                  </td>
                  <td className="mono">{fmtTime(j.createdAt)}</td>
                  <td className="mono">
                    {j.message || j.error || (j.summary ? JSON.stringify(j.summary).slice(0, 80) : "—")}
                    <div className="form-note">id={j.id.slice(0, 8)}…</div>
                  </td>
                  <td>
                    {j.download_available && j.download_url ? (
                      <a className="btn btn-primary" href={j.download_url}>
                        ZIP
                      </a>
                    ) : (
                      <span className="form-note">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
