"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Issue = { level: string; field: string; message: string };

type RunStatus = {
  status: string;
  ok: boolean;
  dry_run: boolean;
  command?: string | null;
  message?: string;
  log_path?: string | null;
  status_path?: string | null;
  ascp_path?: string | null;
  issues?: Issue[];
};

export function NcbiUploadAssist({ entitled, loggedIn }: { entitled: boolean; loggedIn: boolean }) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dataType, setDataType] = useState("transcriptome");
  const [sampleName, setSampleName] = useState("");
  const [organism, setOrganism] = useState("");
  const [isolate, setIsolate] = useState("");
  const [collectionDate, setCollectionDate] = useState("");
  const [strategy, setStrategy] = useState("RNA-Seq");
  const [source, setSource] = useState("TRANSCRIPTOMIC");
  const [selection, setSelection] = useState("cDNA");
  const [layout, setLayout] = useState("paired");
  const [filesText, setFilesText] = useState("sample_R1.fastq.gz\nsample_R2.fastq.gz");
  const [keyPath, setKeyPath] = useState("");
  const [localFolder, setLocalFolder] = useState("");
  const [ncbiEmail, setNcbiEmail] = useState("");
  const [accountFolder, setAccountFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [command, setCommand] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);

  function payload() {
    const files = filesText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((filename) => ({ filename }));
    return {
      bioproject: { title, description, data_type: dataType },
      biosample: {
        sample_name: sampleName,
        organism,
        isolate_or_breed: isolate,
        collection_date: collectionDate,
      },
      library: {
        library_strategy: strategy,
        library_source: source,
        library_selection: selection,
        library_layout: layout,
      },
      files,
      ascp: {
        key_path: keyPath,
        local_folder: localFolder,
        ncbi_user_email: ncbiEmail,
        account_folder: accountFolder,
      },
    };
  }

  async function onValidate(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setIssues([]);
    setCommand(null);
    setRunStatus(null);
    if (!loggedIn) {
      setErr("请先登录");
      return;
    }
    if (!entitled) {
      setErr("需要有效试用或永久会员");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tools/ncbi-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (data.error && !data.issues) {
        setErr(data.error);
        return;
      }
      setIssues(data.issues || []);
      setChecklist(data.checklist || []);
      setCommand(data.ascp_command || null);
      if (!data.ok) setErr("校验未通过，请根据下方问题修改");
      else {
        setErr("");
        setStep(4);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function onRun(mode: "dry-run" | "run") {
    setErr("");
    setRunStatus(null);
    if (!loggedIn || !entitled) {
      setErr("需要登录且具备会员权限");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tools/ncbi-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), mode }),
      });
      const data = await res.json();
      if (data.error && !data.status) {
        setErr(data.error);
        return;
      }
      setRunStatus(data as RunStatus);
      if (data.command) setCommand(data.command);
      if (Array.isArray(data.issues)) setIssues(data.issues);
      if (!data.ok && data.status !== "dry_run") {
        setErr(data.message || "运行失败");
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ncbi-wizard">
      {!loggedIn ? (
        <p className="rules-banner">
          请先 <Link href="/login">登录</Link>。
        </p>
      ) : !entitled ? (
        <p className="rules-banner">当前账号无权使用该协助工具。</p>
      ) : null}

      <ol className="ncbi-steps">
        <li className={step === 1 ? "is-on" : ""}>① 必要元数据</li>
        <li className={step === 2 ? "is-on" : ""}>② 文件清单</li>
        <li className={step === 3 ? "is-on" : ""}>③ Aspera 本机路径</li>
        <li className={step === 4 ? "is-on" : ""}>④ 校验 / dry-run / 上传</li>
      </ol>

      <form className="help-form" onSubmit={onValidate}>
        {step === 1 ? (
          <>
            <h2>BioProject（必要）</h2>
            <label>
              标题
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>
            <label>
              描述
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} required />
            </label>
            <label>
              数据类型
              <input value={dataType} onChange={(e) => setDataType(e.target.value)} required />
            </label>
            <h2>BioSample（必要）</h2>
            <label>
              sample_name
              <input value={sampleName} onChange={(e) => setSampleName(e.target.value)} required />
            </label>
            <label>
              organism
              <input value={organism} onChange={(e) => setOrganism(e.target.value)} required />
            </label>
            <label>
              isolate / breed
              <input value={isolate} onChange={(e) => setIsolate(e.target.value)} required />
            </label>
            <label>
              collection_date
              <input
                value={collectionDate}
                onChange={(e) => setCollectionDate(e.target.value)}
                placeholder="YYYY-MM-DD"
                required
              />
            </label>
            <h2>文库（必要）</h2>
            <label>
              library_strategy
              <input value={strategy} onChange={(e) => setStrategy(e.target.value)} required />
            </label>
            <label>
              library_source
              <input value={source} onChange={(e) => setSource(e.target.value)} required />
            </label>
            <label>
              library_selection
              <input value={selection} onChange={(e) => setSelection(e.target.value)} required />
            </label>
            <label>
              library_layout
              <select value={layout} onChange={(e) => setLayout(e.target.value)}>
                <option value="paired">paired</option>
                <option value="single">single</option>
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
              下一步：文件清单
            </button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2>文件清单（必要）</h2>
            <label>
              每行一个文件名（须与本地上传目录一致）
              <textarea value={filesText} onChange={(e) => setFilesText(e.target.value)} rows={5} required />
            </label>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setStep(1)}>
                上一步
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
                下一步：Aspera
              </button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2>Aspera 运行时信息（必要；密钥不上传）</h2>
            <label>
              本机私钥绝对路径
              <input
                value={keyPath}
                onChange={(e) => setKeyPath(e.target.value)}
                placeholder="/Users/you/keys/aspera.openssh"
                required
              />
            </label>
            <label>
              本地待上传文件夹
              <input
                value={localFolder}
                onChange={(e) => setLocalFolder(e.target.value)}
                placeholder="/Users/you/data/sra"
                required
              />
            </label>
            <label>
              NCBI 账户邮箱（ascp 用户）
              <input type="email" value={ncbiEmail} onChange={(e) => setNcbiEmail(e.target.value)} required />
            </label>
            <label>
              uploads 子目录名
              <input value={accountFolder} onChange={(e) => setAccountFolder(e.target.value)} required />
            </label>
            <p className="form-note">
              私钥内容请勿粘贴到网页。本机 dry-run / 运行仅使用路径；密钥内容不落库、不进日志。
            </p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setStep(2)}>
                上一步
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy || !loggedIn || !entitled}>
                {busy ? "校验中…" : "校验并进入运行步"}
              </button>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <h2>校验结果与本机上传</h2>
            <p className="form-note">
              先 dry-run（校验路径/文件并写 status.json），确认无误后再对本机执行 ascp。Submission Portal
              网页代填仍未自动化。
            </p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setStep(3)} disabled={busy}>
                返回修改
              </button>
              <button type="button" className="btn" onClick={() => void onValidate({ preventDefault() {} } as FormEvent)} disabled={busy}>
                重新校验
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onRun("dry-run")}>
                {busy ? "处理中…" : "Dry-run"}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void onRun("run")}>
                本机执行 ascp
              </button>
            </div>
          </>
        ) : null}

        {err ? <p className="rules-banner">{err}</p> : null}
      </form>

      {issues.length ? (
        <section className="section" style={{ marginTop: "1rem" }}>
          <h2>校验问题</h2>
          <ul>
            {issues.map((i, idx) => (
              <li key={idx} className="mono">
                [{i.level}] {i.field}: {i.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {command ? (
        <section className="section" style={{ marginTop: "1rem" }}>
          <h2>建议 ascp 命令</h2>
          <pre className="mono" style={{ whiteSpace: "pre-wrap" }}>
            {command}
          </pre>
          {checklist.length ? (
            <>
              <h3>自动清单</h3>
              <ol>
                {checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      ) : null}

      {runStatus ? (
        <section className="section" style={{ marginTop: "1rem" }}>
          <h2>运行状态</h2>
          <p className="mono">
            status={runStatus.status} · ok={String(runStatus.ok)} · dry_run={String(runStatus.dry_run)}
            {runStatus.ascp_path ? ` · ascp=${runStatus.ascp_path}` : ""}
          </p>
          {runStatus.message ? <p>{runStatus.message}</p> : null}
          {runStatus.log_path ? <p className="form-note mono">log: {runStatus.log_path}</p> : null}
          {runStatus.status_path ? <p className="form-note mono">status: {runStatus.status_path}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
