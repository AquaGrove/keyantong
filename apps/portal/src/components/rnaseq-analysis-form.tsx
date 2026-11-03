"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

type Summary = {
  genes_used: number;
  genes_dropped: number;
  n_samples: number;
  comparisons: {
    name: string;
    token: string;
    n_up: number;
    n_down: number;
    volcano_svg: string;
  }[];
  pca: { variance: { pc: string; fraction: number }[] };
  venn: { skipped?: boolean; reason?: string };
  enrichment: { ok?: boolean; error?: string; skipped?: boolean; go_terms?: number; kegg_terms?: number; kegg_error?: string };
  heatmap_genes: string[];
};

const GENE_ALIASES = new Set(["gene_id", "geneid", "gene", "id", "gene_name", "genename"]);

function headerSamples(text: string): string[] {
  const line = text.split(/\r?\n/).find((row) => row.trim() && !row.trim().startsWith("#")) || "";
  const tabs = (line.match(/\t/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  const delim = tabs > 0 && tabs >= commas ? "\t" : ",";
  const cells = line.split(delim).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  let geneIdx = cells.findIndex((cell) => GENE_ALIASES.has(cell.toLowerCase().replace(/[\s-]+/g, "_")));
  if (geneIdx < 0) geneIdx = 0;
  return cells.filter((cell, index) => index !== geneIdx && cell);
}

export function RnaseqAnalysisForm({ entitled, loggedIn }: { entitled: boolean; loggedIn: boolean }) {
  const [samples, setSamples] = useState<string[]>([]);
  const [assignment, setAssignment] = useState<Record<string, string>>({});
  const [treatments, setTreatments] = useState<string[]>(["treatment"]);
  const [species, setSpecies] = useState("arabidopsis");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ jobId: string; summary: Summary; base: string } | null>(null);

  const options = useMemo(() => ["control", ...treatments], [treatments]);

  async function onFile(file: File | undefined) {
    setResult(null);
    setErr("");
    if (!file) {
      setSamples([]);
      return;
    }
    const text = await file.slice(0, 64_000).text();
    const next = headerSamples(text);
    setSamples(next);
    setAssignment(Object.fromEntries(next.map((sample) => [sample, ""])));
  }

  function groupsPayload() {
    const control = samples.filter((sample) => assignment[sample] === "control");
    const rows = treatments
      .map((name) => ({
        name,
        samples: samples.filter((sample) => assignment[sample] === name),
      }))
      .filter((row) => row.samples.length > 0);
    return { control, treatments: rows };
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!entitled) return;
    const missing = samples.filter((sample) => !assignment[sample]);
    if (missing.length) {
      setErr(`还有样本没分组：${missing.slice(0, 6).join("、")}`);
      return;
    }
    setErr("");
    setBusy(true);
    const body = new FormData(e.currentTarget);
    body.set("groups", JSON.stringify(groupsPayload()));
    body.set("species", species);
    const res = await fetch("/api/tools/rnaseq/run", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setResult(null);
      setErr(data.error || "分析失败");
      return;
    }
    setResult(data);
  }

  const summary = result?.summary;
  const pc1 = summary?.pca.variance.find((row) => row.pc === "PC1");
  const pc2 = summary?.pca.variance.find((row) => row.pc === "PC2");

  return (
    <div>
      {!loggedIn ? (
        <p className="rules-banner">
          运行分析需要校园账号。<Link href="/login"> 登录</Link>
          {" · "}
          <Link href="/register">注册</Link>
        </p>
      ) : null}
      {loggedIn && !entitled ? (
        <p className="rules-banner">
          试用已结束。开通永久会员后可以继续跑转录组分析。
          <Link href="/pricing"> 查看会员说明</Link>
        </p>
      ) : null}
      <form className="help-form" onSubmit={onSubmit} style={{ maxWidth: "46rem" }}>
        <label>
          表达矩阵（基因 × 样本，TPM 或 FPKM，CSV / TSV）
          <input
            name="matrix"
            type="file"
            accept=".csv,.tsv,.txt,.tab"
            required
            disabled={!entitled || busy}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <label>
          物种注释（只影响 GO / KEGG；没有本地注释库时这一步会失败，其他图照常给出）
          <select value={species} onChange={(e) => setSpecies(e.target.value)} disabled={!entitled || busy}>
            <option value="arabidopsis">拟南芥 arabidopsis</option>
            <option value="human">人类 human</option>
            <option value="mouse">小鼠 mouse</option>
            <option value="none">不做富集</option>
          </select>
        </label>
        {samples.length > 0 ? (
          <div>
            <p className="form-note">把每个样本列标成对照或处理组。不需要另传差异基因表或 GO 表。</p>
            {treatments.map((name, index) => (
              <label key={index}>
                处理组 {index + 1} 名称
                <input
                  value={name}
                  disabled={!entitled || busy}
                  onChange={(e) => {
                    const next = [...treatments];
                    const previous = next[index];
                    next[index] = e.target.value.trim();
                    setTreatments(next);
                    setAssignment((curr) => {
                      const copy = { ...curr };
                      for (const sample of samples) {
                        if (copy[sample] === previous) copy[sample] = next[index];
                      }
                      return copy;
                    });
                  }}
                />
              </label>
            ))}
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!entitled || busy || treatments.length >= 3}
              onClick={() => setTreatments((curr) => [...curr, `treatment${curr.length + 1}`])}
            >
              添加处理组
            </button>
            <table className="pca-table">
              <thead>
                <tr>
                  <th>样本列</th>
                  <th>分组</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((sample) => (
                  <tr key={sample}>
                    <td>{sample}</td>
                    <td>
                      <select
                        value={assignment[sample] || ""}
                        disabled={!entitled || busy}
                        onChange={(e) => setAssignment((curr) => ({ ...curr, [sample]: e.target.value }))}
                      >
                        <option value="">未分配</option>
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option === "control" ? "对照 control" : `处理 ${option}`}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="form-note">选好矩阵后，这里会列出样本列，用来指定对照和处理组。</p>
        )}
        <button className="btn btn-primary" type="submit" disabled={!entitled || busy || samples.length === 0}>
          {busy ? "正在分析…" : "运行分析"}
        </button>
      </form>
      {err ? <p className="rules-banner">{err}</p> : null}
      {summary && result ? (
        <section className="section" style={{ marginTop: "1.25rem" }}>
          <h2>结果</h2>
          <p className="form-note">
            {summary.n_samples} 个样本，使用 {summary.genes_used} 个基因
            {summary.genes_dropped ? `，去掉零方差 ${summary.genes_dropped} 个` : ""}。已做 log2(x+1)。
            PC1 {((pc1?.fraction || 0) * 100).toFixed(1)}%，PC2 {((pc2?.fraction || 0) * 100).toFixed(1)}%。
          </p>
          <p className="form-note">
            {summary.comparisons.map((row) => (
              <span key={row.token}>
                {row.name}：上调 {row.n_up}，下调 {row.n_down}。{" "}
              </span>
            ))}
          </p>
          {summary.enrichment.skipped ? (
            <p className="form-note">{summary.enrichment.error}</p>
          ) : !summary.enrichment.ok ? (
            <p className="rules-banner">{summary.enrichment.error}</p>
          ) : null}
          {summary.enrichment.ok ? (
            <p className="form-note">
              GO 显著条目 {summary.enrichment.go_terms || 0}，KEGG 显著条目 {summary.enrichment.kegg_terms || 0}。
              {summary.enrichment.kegg_error ? ` ${summary.enrichment.kegg_error}` : ""}
            </p>
          ) : null}
          <h3>PCA</h3>
          <img className="pca-preview" alt="PCA" src={`${result.base}/pca.svg`} />
          {summary.comparisons.map((row) => (
            <div key={row.token}>
              <h3>火山图 · {row.name}</h3>
              <img className="pca-preview" alt={`${row.name} volcano`} src={`${result.base}/${row.volcano_svg}`} />
            </div>
          ))}
          <h3>热图</h3>
          <img className="pca-preview" alt="heatmap" src={`${result.base}/heatmap.svg`} />
          {!summary.venn.skipped ? (
            <>
              <h3>韦恩图</h3>
              <img className="pca-preview" alt="venn" src={`${result.base}/venn.svg`} />
            </>
          ) : (
            <p className="form-note">{summary.venn.reason}</p>
          )}
          {summary.enrichment.ok ? (
            <>
              <h3>GO</h3>
              <img className="pca-preview" alt="GO bubble" src={`${result.base}/go_bubble.svg`} />
            </>
          ) : null}
          <div className="pca-downloads">
            <a className="btn btn-secondary" href={`${result.base}/results.zip`}>
              下载结果包
            </a>
            <a className="btn btn-secondary" href={`${result.base}/pca.png`}>
              PCA PNG
            </a>
            {summary.comparisons.map((row) => (
              <a key={row.token} className="btn btn-secondary" href={`${result.base}/de_${row.token}_vs_control.tsv`}>
                {row.name} 差异表
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
