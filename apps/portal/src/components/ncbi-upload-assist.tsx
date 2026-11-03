"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type Issue = { level: string; field: string; message: string };

export function NcbiUploadAssist({ entitled, loggedIn }: { entitled: boolean; loggedIn: boolean }) {
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setIssues([]);
    setCommand(null);
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
      const files = filesText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((filename) => ({ filename }));
      const res = await fetch("/api/tools/ncbi-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
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
          请先 <Link href="/login">登录</Link>。
        </p>
      ) : !entitled ? (
        <p className="rules-banner">当前账号无权使用该协助工具。</p>
      ) : null}

      <form className="help-form" onSubmit={onSubmit}>
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
          <input value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} placeholder="YYYY-MM-DD" required />
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

        <h2>文件清单（必要）</h2>
        <label>
          每行一个文件名（须与本地上传目录一致）
          <textarea value={filesText} onChange={(e) => setFilesText(e.target.value)} rows={4} required />
        </label>

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
          <input value={localFolder} onChange={(e) => setLocalFolder(e.target.value)} placeholder="/Users/you/data/sra" required />
        </label>
        <label>
          NCBI 账户邮箱（ascp 用户）
          <input type="email" value={ncbiEmail} onChange={(e) => setNcbiEmail(e.target.value)} required />
        </label>
        <label>
          uploads 子目录名
          <input value={accountFolder} onChange={(e) => setAccountFolder(e.target.value)} required />
        </label>
        <p className="form-note">私钥内容请勿粘贴到网页。系统只生成命令，实际上传在你本机执行。</p>

        {err ? <p className="rules-banner">{err}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy || !loggedIn || !entitled}>
          {busy ? "校验中…" : "校验并生成 ascp 命令"}
        </button>
      </form>

      {issues.length ? (
        <section className="section" style={{ marginTop: "1rem" }}>
          <h2>校验结果</h2>
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
          <h3>自动清单</h3>
          <ol>
            {checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
