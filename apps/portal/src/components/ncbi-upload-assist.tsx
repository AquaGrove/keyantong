"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ToolsJobHistory } from "@/components/tools-job-history";

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

type ChecklistStep = {
  id: string;
  label: string;
  done: boolean;
  kind?: "auto" | "manual";
  hint?: string;
};

type PortalChecklist = {
  automation_policy: string;
  steps: ChecklistStep[];
  next: string | null;
  notes?: Record<string, string>;
};

const FALLBACK_STEPS: ChecklistStep[] = [
  { id: "validate", label: "字段与文件清单校验通过", done: false, kind: "auto", hint: "本工具自动" },
  { id: "dry_run", label: "已生成本地 dry-run 助手包", done: false, kind: "auto", hint: "在用户本机执行" },
  { id: "ascp_upload", label: "本机 ascp 直连 NCBI 成功（用户勾选）", done: false, kind: "manual", hint: "用户本机完成后勾选" },
  { id: "portal_login", label: "用户已在浏览器登录 Submission Portal", done: false, kind: "manual", hint: "浏览器手动" },
  { id: "bioproject", label: "用户已创建/选择 BioProject", done: false, kind: "manual", hint: "浏览器手动" },
  { id: "biosample", label: "用户已创建 BioSample 并粘贴校验字段", done: false, kind: "manual", hint: "浏览器手动" },
  { id: "sra_submit", label: "用户已创建 SRA submission 并关联文件", done: false, kind: "manual", hint: "浏览器手动" },
  { id: "accessions", label: "用户已保存 Accession", done: false, kind: "manual", hint: "浏览器手动" },
];

function mergeChecklist(base: PortalChecklist | null, patchDone: Partial<Record<string, boolean>>): PortalChecklist {
  const steps = (base?.steps?.length ? base.steps : FALLBACK_STEPS).map((s) => ({
    ...s,
    done: patchDone[s.id] ?? s.done,
  }));
  const next = steps.find((s) => !s.done)?.id || null;
  return {
    automation_policy: base?.automation_policy || "no_browser_automation",
    steps,
    next,
    notes: base?.notes || {},
  };
}

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
  const [checklistLegacy, setChecklistLegacy] = useState<string[]>([]);
  const [portalChecklist, setPortalChecklist] = useState<PortalChecklist | null>(null);
  const [manualDone, setManualDone] = useState<Record<string, boolean>>({});
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [lastMode, setLastMode] = useState<"dry-run" | "run" | null>(null);
  const [helperScript, setHelperScript] = useState<string | null>(null);
  const [howToRun, setHowToRun] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const viewChecklist = useMemo(
    () => mergeChecklist(portalChecklist, manualDone),
    [portalChecklist, manualDone],
  );

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

  function applyPortalChecklist(pc: PortalChecklist | null | undefined) {
    if (!pc) return;
    setPortalChecklist(pc);
    // auto steps drive state; keep prior manual toggles
  }

  async function onValidate(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setIssues([]);
    setCommand(null);
    setRunStatus(null);
    setLastMode(null);
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
      setChecklistLegacy(data.checklist || []);
      setCommand(data.ascp_command || null);
      applyPortalChecklist(data.portal_checklist);
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

  function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onPrepareLocal(mode: "dry-run" | "run") {
    setErr("");
    setRunStatus(null);
    setLastMode(mode);
    setCopied(false);
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
      if (!res.ok && !data.ascp_command && !data.helper_script) {
        setErr(data.error || "生成失败");
        if (Array.isArray(data.issues)) setIssues(data.issues);
        return;
      }
      if (Array.isArray(data.issues)) setIssues(data.issues);
      if (data.ascp_command) setCommand(String(data.ascp_command));
      if (data.helper_script) setHelperScript(String(data.helper_script));
      if (Array.isArray(data.how_to_run)) setHowToRun(data.how_to_run);
      if (data.portal_checklist) applyPortalChecklist(data.portal_checklist);
      if (data.ok) {
        applyPortalChecklist(
          mergeChecklist(portalChecklist || data.portal_checklist, {
            validate: true,
            dry_run: mode === "dry-run" || mode === "run" ? true : undefined,
          }),
        );
        setRunStatus({
          status: mode === "dry-run" ? "local_pack_dry_run" : "local_pack_run",
          ok: true,
          dry_run: mode === "dry-run",
          command: data.ascp_command,
          message: data.message || "已生成本地助手包（服务器未执行 ascp）",
        });
        setErr("");
      } else {
        setErr(data.error || data.message || "校验未通过，未生成助手包");
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function copyCommand() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("复制失败，请手动选中命令");
    }
  }

    function toggleManual(id: string) {
    const stepMeta = viewChecklist.steps.find((s) => s.id === id);
    if (stepMeta?.kind === "auto") return;
    setManualDone((prev) => ({ ...prev, [id]: !viewChecklist.steps.find((s) => s.id === id)?.done }));
  }

  return (
    <div className="ncbi-wizard">
      <div className="rules-banner" role="note">
        <strong>架构原则：</strong>
        测序大数据<strong>不经过科研通服务器</strong>。本页只收集元数据、校验字段、生成你可在本机运行的 ascp
        命令 / 助手脚本；文件由你的电脑经 Aspera <strong>直连 NCBI</strong>。禁止把 FASTQ/BAM 上传到本站再转发。
      </div>
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
        <li className={step === 4 ? "is-on" : ""}>④ 校验 / 本机命令</li>
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
              私钥内容请勿粘贴到网页。这里只记录<strong>本机绝对路径字符串</strong>，用于生成命令；
              科研通服务器不会读取该路径下的文件，也不会代传测序数据。
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
            <h2>校验结果 · 生成本地上传助手</h2>
            <div className="ncbi-mode-cards">
              <article className={`ncbi-mode-card${lastMode === "dry-run" ? " is-on" : ""}`}>
                <h3>生成本地 dry-run 包</h3>
                <p>
                  门户只做元数据校验并生成脚本；<strong>不在服务器读你的测序文件</strong>。
                  你在本机跑脚本时才会检查路径（仍不上传）。
                </p>
              </article>
              <article className={`ncbi-mode-card${lastMode === "run" ? " is-on" : ""}`}>
                <h3>生成本机实际上传包</h3>
                <p>
                  下载助手后在你的电脑执行 ascp，<strong>直连 NCBI</strong>。
                  密钥仅本机路径、不落库。本站<strong>不做</strong> Submission Portal 网页代填。
                </p>
              </article>
            </div>

            <section className="ncbi-checklist" aria-label="portal checklist">
              <div className="ncbi-checklist-head">
                <h3>进度清单（状态机）</h3>
                <p className="form-note mono">
                  policy={viewChecklist.automation_policy} · next={viewChecklist.next || "done"}
                </p>
              </div>
              <ul className="ncbi-checklist-list">
                {viewChecklist.steps.map((s) => (
                  <li key={s.id} className={s.done ? "is-done" : ""}>
                    <label>
                      <input
                        type="checkbox"
                        checked={s.done}
                        disabled={s.kind === "auto" || busy}
                        onChange={() => toggleManual(s.id)}
                      />
                      <span>
                        <strong>{s.label}</strong>
                        <em>
                          {s.kind === "auto" ? "自动" : "手动"} · {s.hint || ""}
                        </em>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="form-note">
                校验与「生成本地包」可自动勾选；真正 ascp 成功请你在本机跑完后手动勾选。本站<strong>不做</strong>{" "}
                Submission Portal 浏览器自动化，也<strong>不中转</strong>测序文件。
              </p>
            </section>

            <div className="actions">
              <button type="button" className="btn" onClick={() => setStep(3)} disabled={busy}>
                返回修改
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void onValidate({ preventDefault() {} } as FormEvent)}
                disabled={busy}
              >
                重新校验
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void onPrepareLocal("dry-run")}
                title="生成 dry-run 本地助手"
              >
                {busy && lastMode === "dry-run" ? "生成中…" : "① 生成本地 dry-run 包"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void onPrepareLocal("run")}
                title="生成实际上传本地助手"
              >
                {busy && lastMode === "run" ? "生成中…" : "② 生成本机上传包"}
              </button>
              <button type="button" className="btn" disabled={!command || busy} onClick={() => void copyCommand()}>
                {copied ? "已复制命令" : "复制 ascp 命令"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!helperScript || busy}
                onClick={() => helperScript && downloadText("keyantong-ncbi-local-upload.sh", helperScript)}
              >
                下载本地助手 .sh
              </button>
              <button
                type="button"
                className="btn"
                disabled={!command || busy}
                onClick={() =>
                  downloadText("ncbi-payload.json", JSON.stringify(payload(), null, 2), "application/json")
                }
              >
                下载 payload.json
              </button>
            </div>
            {howToRun.length ? (
              <ol className="check-list" style={{ marginTop: "1rem" }}>
                {howToRun.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
            ) : null}
            <p className="form-note">
              本机执行示例：
              <code className="mono">chmod +x keyantong-ncbi-local-upload.sh && ./keyantong-ncbi-local-upload.sh</code>
              ；或直接粘贴 ascp 命令。ascp 需自行安装 Aspera Connect（IBM 许可）。
            </p>
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
          {checklistLegacy.length ? (
            <>
              <h3>遗留文字清单</h3>
              <ol>
                {checklistLegacy.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      ) : null}

      {runStatus ? (
        <section className="section" style={{ marginTop: "1rem" }}>
          <h2>本地助手包状态</h2>
          <p className="mono">
            mode={lastMode || "?"} · status={runStatus.status} · ok={String(runStatus.ok)} · dry_run=
            {String(runStatus.dry_run)}
            {runStatus.ascp_path ? ` · ascp=${runStatus.ascp_path}` : ""}
          </p>
          {runStatus.message ? <p>{runStatus.message}</p> : null}
          {runStatus.log_path ? <p className="form-note mono">log: {runStatus.log_path}</p> : null}
          {runStatus.status_path ? <p className="form-note mono">status: {runStatus.status_path}</p> : null}
        </section>
      ) : null}

      <ToolsJobHistory loggedIn={loggedIn} entitled={entitled} filterKind="ncbi" />
    </div>
  );
}
