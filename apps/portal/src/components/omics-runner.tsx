"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { METHODS } from "@/lib/analysis/methods";
type Job = {
  id: string;
  status: string;
  parameters: {
    method: string;
    summary?: {
      warnings: string[];
      testedVariants?: number;
      retainedVariants?: number;
    };
  };
  last_error?: string;
  created_at: string;
};
export function OmicsRunner({
  kind,
  loggedIn,
  entitled,
  enabled,
}: {
  kind: "gwas" | "bsaseq";
  loggedIn: boolean;
  entitled: boolean;
  enabled: boolean;
}) {
  const method = METHODS.find((m) => m.module === kind)!;
  const [jobs, setJobs] = useState<Job[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [config, setConfig] = useState<Record<string, number>>(
    kind === "gwas"
      ? { maf: 0.05, pcs: 2, ploidy: 2 }
      : { minDepth: 10, windowBp: 1000000 },
  );
  const mounted = useRef(true);
  async function refresh() {
    try {
      const r = await fetch("/api/analysis/jobs", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (mounted.current) setJobs(d.jobs);
    } catch (e) {
      if (mounted.current)
        setMessage(e instanceof Error ? e.message : "任务读取失败");
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (loggedIn) void refresh();
    return () => {
      mounted.current = false;
    };
  }, [loggedIn]);
  const active = jobs.some((j) => ["queued", "running"].includes(j.status));
  useEffect(() => {
    if (!active || !loggedIn) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [active, loggedIn]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      const fd = new FormData(form);
      fd.set("method", method.id);
      fd.set("config", JSON.stringify(config));
      fd.set("acknowledged", "true");
      const r = await fetch("/api/analysis/jobs", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage(
        d.reused
          ? "已找到相同输入与参数的任务，直接查看结果。"
          : "数据已校验保存，任务已加入分析队列。",
      );
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }
  const statusName: Record<string, string> = {
    queued: "排队中",
    running: "正在分析",
    succeeded: "已完成",
    failed: "未完成",
    cancelled: "已取消",
  };
  return (
    <section className="omics-workbench">
      <p className="page-kicker">EXPERIMENTAL / VERSION {method.version}</p>
      <h2>{method.name}</h2>
      <p className="section-lead">{method.limitations}</p>
      <div className="resource-note">
        <span>
          {method.inputs}。单文件最多 12 MB，单次总计不超过 20 MB；在线初版最多
          100,000 行。大规模或多倍体数据请先发起分析协作。
        </span>
      </div>
      {!enabled ? (
        <p className="capability-note">
          此环境暂未开放任务提交。你仍可查看格式和下载示例。
        </p>
      ) : null}
      <div className="actions">
        {method.files.map((f) => (
          <a
            key={f}
            className="btn btn-secondary"
            href={`/analysis-examples/${f}`}
            download
          >
            下载{f}示例 ↓
          </a>
        ))}
      </div>
      <details style={{ margin: "1rem 0" }}>
        <summary>输入格式与参数说明</summary>
        {kind === "gwas" ? (
          <>
            <p>
              genotypes.csv：id,chrom,pos,ref,alt 后接每个样本的剂量列，值为
              0/1/2，缺失留空。phenotypes.csv：sample,trait，样本必须完全对应，trait
              是连续数值。
            </p>
            <p>
              自动进行 MAF、样本及位点缺失过滤，LD 剪枝后计算 PCA，再用 PC
              作为线性模型协变量。该方法不代替亲缘矩阵混合模型。
            </p>
          </>
        ) : (
          <>
            <p>
              counts.csv 必须包含
              chrom,pos,ref_high,alt_high,ref_low,alt_low。以同一个 ALT
              等位基因为方向，pos 为 1-based 正整数；每个位置只保留一个双等位
              SNP。
            </p>
            <p>
              ΔSNP-index = high 中 ALT 频率 − low 中 ALT 频率。窗口为从坐标 1
              开始的固定宽度、不重叠窗口。Fisher/BH 只检验读段计数差异。
            </p>
          </>
        )}
        <p>
          示例为固定随机种子生成的合成数据，只用于检查运行链路，不是算法有效性的真实生物学证据。
        </p>
      </details>
      <form onSubmit={submit}>
        <div className="omics-fields">
          {method.files.map((f) => (
            <label key={f}>
              {f}
              <input
                type="file"
                name={f}
                accept=".csv,text/csv"
                required
                disabled={busy}
              />
            </label>
          ))}
          {(kind === "gwas"
            ? [
                ["maf", "最小等位基因频率 MAF", 0.001, 0.49, 0.001],
                ["pcs", "PCA 协变量个数", 1, 5, 1],
              ]
            : [
                ["minDepth", "每个池的最小读段深度", 1, 10000, 1],
                ["windowBp", "窗口大小（bp）", 100, 100000000, 100],
              ]
          ).map(([key, label, min, max, step]) => (
            <label key={String(key)}>
              {label}
              <input
                type="number"
                value={config[String(key)]}
                min={Number(min)}
                max={Number(max)}
                step={Number(step)}
                required
                onChange={(e) =>
                  setConfig({
                    ...config,
                    [String(key)]: Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="resource-consent">
          <input type="checkbox" required />{" "}
          我已确认样本、基因组版本及算法适用范围，同意使用当前探索性基线；不将结果直接视为因果结论。
        </label>
        {loggedIn ? (
          <button
            className="btn btn-primary"
            disabled={busy || !entitled || !enabled}
          >
            {busy ? "正在准备私有输入…" : "提交分析任务 ↗"}
          </button>
        ) : (
          <a className="btn btn-primary" href={`/login?next=/analysis/${kind}`}>
            登录后分析 ↗
          </a>
        )}
        {loggedIn && !entitled ? (
          <p className="form-note">
            计算任务需要有效校园试用或永久会员；浏览、资源补充和科研协作对普通用户开放。
          </p>
        ) : null}
      </form>
      <p role="status" className="form-note">
        {message}
      </p>
      <div className="actions">
        <h3>我的分析任务</h3>
        {loggedIn ? (
          <button className="btn btn-secondary" onClick={refresh}>
            刷新任务
          </button>
        ) : null}
      </div>
      {jobs
        .filter((j) => j.parameters.method === method.id)
        .map((j) => (
          <article className="omics-job" key={j.id}>
            <strong>{statusName[j.status] || j.status}</strong>
            <span className="form-note">
              {" "}
              · {new Date(j.created_at).toLocaleString("zh-CN")}
            </span>
            <p className="form-note">任务 {j.id}</p>
            {j.last_error ? <p role="alert">{j.last_error}</p> : null}
            {j.parameters.summary ? (
              <div className="omics-result">
                <p>
                  分析位点：
                  {j.parameters.summary.testedVariants ??
                    j.parameters.summary.retainedVariants}
                </p>
                {j.parameters.summary.warnings?.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <a
                  className="btn btn-primary"
                  href={`/api/analysis/jobs/${j.id}/download`}
                >
                  下载结果与运行记录 ↓
                </a>
              </div>
            ) : null}
          </article>
        ))}
    </section>
  );
}
