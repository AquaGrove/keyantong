"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Job = {
  id: string;
  status: string;
  error?: string;
  message?: string;
  summary?: {
    n_genes?: number;
    n_samples?: number;
    n_up?: number;
    n_down?: number;
    control_label?: string;
    treatment_label?: string;
    enrichment?: string;
    n_contrasts?: number;
    de_engine?: string;
  };
};

type GroupRole = "control" | "treatment" | "custom";

type GroupCard = {
  id: string;
  name: string;
  role: GroupRole;
  color: string;
  samples: string[];
};

type ContrastOpt = {
  id: string;
  label: string;
  treatment: string;
  control: string;
};

const PALETTE = [
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be185d",
  "#0369a1",
  "#ca8a04",
  "#15803d",
  "#c2410c",
  "#4f46e5",
  "#0d9488",
];

const VENN_MODE_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "up_down_per_contrast", label: "各对比 · 上调 vs 下调", hint: "每个对比单独画上下调维恩" },
  { id: "multi_group_up", label: "多组 · 仅上调", hint: "各实验组相对对照的上调基因集合" },
  { id: "multi_group_down", label: "多组 · 仅下调", hint: "各实验组相对对照的下调基因集合" },
  { id: "multi_group_deg", label: "多组 · 显著差异 (↑∪↓)", hint: "上下调并集，看多组共有/特有" },
];

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function parseDelimiter(text: string) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const commas = (first.match(/,/g) || []).length;
  const tabs = (first.match(/\t/g) || []).length;
  return tabs > commas ? "\t" : ",";
}

function parseMatrixSamples(text: string): string[] {
  const delim = parseDelimiter(text);
  const first = text.split(/\r?\n/).find((l) => l.trim());
  if (!first) return [];
  const cols = first.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  return cols.slice(1).filter(Boolean);
}

function parseGroupsCsv(text: string): { sample: string; group: string }[] {
  const delim = parseDelimiter(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(delim).map((c) => c.trim().toLowerCase());
  let si = header.findIndex((h) => ["sample", "sample_id", "sampleid", "id", "样本"].includes(h));
  let gi = header.findIndex((h) => ["group", "condition", "class", "分组", "组别"].includes(h));
  if (si < 0 || gi < 0) {
    si = 0;
    gi = 1;
  }
  const rows: { sample: string; group: string }[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (parts[si] && parts[gi]) rows.push({ sample: parts[si], group: parts[gi] });
  }
  return rows;
}

function guessRole(name: string, index: number): GroupRole {
  const low = name.toLowerCase();
  if (/(control|ctrl|对照|wt)/.test(low)) return "control";
  if (/(treat|exp|实验|处理|oe|rnai|koe)/.test(low)) return "treatment";
  return index === 0 ? "control" : "treatment";
}

function defaultGroups(): GroupCard[] {
  return [
    { id: uid("g"), name: "对照", role: "control", color: PALETTE[0], samples: [] },
    { id: uid("g"), name: "实验A", role: "treatment", color: PALETTE[1], samples: [] },
  ];
}

export function RnaseqRunner({ entitled, loggedIn }: { entitled: boolean; loggedIn: boolean }) {
  const [matrix, setMatrix] = useState<File | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [groups, setGroups] = useState<GroupCard[]>(defaultGroups);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dragSample, setDragSample] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [species, setSpecies] = useState("none");
  const [lfc, setLfc] = useState(1);
  const [padj, setPadj] = useState(0.05);
  const [deEngine, setDeEngine] = useState("auto");
  const [plotPca, setPlotPca] = useState(true);
  const [plotVolcano, setPlotVolcano] = useState(true);
  const [plotHeatmap, setPlotHeatmap] = useState(true);
  const [plotVenn, setPlotVenn] = useState(true);
  const [dpi, setDpi] = useState(180);
  const [palette, setPalette] = useState("okabe_ito");
  const [exportSvg, setExportSvg] = useState(true);
  const [exportPdf, setExportPdf] = useState(true);
  const [titlePca, setTitlePca] = useState("PCA (log2 expression)");
  const [titleVolcano, setTitleVolcano] = useState("Volcano");
  const [titleHeatmap, setTitleHeatmap] = useState("Heatmap (top DE genes, z-score)");
  const [vennModes, setVennModes] = useState<string[]>(VENN_MODE_OPTIONS.map((m) => m.id));
  const [upColor, setUpColor] = useState("#b91c1c");
  const [downColor, setDownColor] = useState("#1d4ed8");
  const [selectedContrastIds, setSelectedContrastIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [job, setJob] = useState<Job | null>(null);

  const assigned = useMemo(() => new Set(groups.flatMap((g) => g.samples)), [groups]);
  const unassigned = useMemo(() => samples.filter((s) => !assigned.has(s)), [samples, assigned]);

  const allContrasts: ContrastOpt[] = useMemo(() => {
    const controls = groups.filter((g) => g.role === "control" && g.samples.length >= 2);
    const ctrl = controls[0];
    if (!ctrl) return [];
    return groups
      .filter((g) => g.id !== ctrl.id && g.role !== "control" && g.samples.length >= 2)
      .map((g) => ({
        id: `${g.name}_vs_${ctrl.name}`,
        label: `${g.name} vs ${ctrl.name}`,
        treatment: g.id,
        control: ctrl.id,
      }));
  }, [groups]);

  // keep selected contrasts in sync when group names change; default = all
  useEffect(() => {
    const ids = allContrasts.map((c) => c.id);
    setSelectedContrastIds((prev) => {
      if (!ids.length) return [];
      const kept = prev.filter((id) => ids.includes(id));
      if (!prev.length) return ids;
      // if new contrasts appeared, auto-include them
      const missing = ids.filter((id) => !prev.includes(id));
      if (!kept.length) return ids;
      return Array.from(new Set([...kept, ...missing]));
    });
  }, [allContrasts]);

  const activeContrasts = useMemo(
    () => allContrasts.filter((c) => selectedContrastIds.includes(c.id)),
    [allContrasts, selectedContrastIds],
  );

  async function onMatrixChange(file: File | null) {
    setMatrix(file);
    setJob(null);
    if (!file) {
      setSamples([]);
      return;
    }
    const text = await file.text();
    const cols = parseMatrixSamples(text);
    setSamples(cols);
    setGroups((prev) => prev.map((g) => ({ ...g, samples: g.samples.filter((s) => cols.includes(s)) })));
  }

  async function onGroupsFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    if (text.trim().startsWith("{")) {
      try {
        const data = JSON.parse(text);
        const list = (data.groups || []) as Array<Record<string, unknown>>;
        if (!list.length) return;
        setGroups(
          list.map((g, i) => ({
            id: String(g.id || uid("g")),
            name: String(g.name || `组${i + 1}`),
            role: (["control", "treatment", "custom"].includes(String(g.role))
              ? String(g.role)
              : guessRole(String(g.name || ""), i)) as GroupRole,
            color: String(g.color || PALETTE[i % PALETTE.length]),
            samples: ((g.samples || g.sampleIds || []) as string[]).map(String),
          })),
        );
        const opts = (data.options || {}) as Record<string, unknown>;
        if (typeof opts.lfc === "number") setLfc(opts.lfc);
        if (typeof opts.padj === "number") setPadj(opts.padj);
        if (typeof opts.species === "string") setSpecies(opts.species);
        if (typeof opts.de_engine === "string") setDeEngine(opts.de_engine);
        const plots = (opts.plots || {}) as Record<string, unknown>;
        if (typeof plots.dpi === "number") setDpi(plots.dpi);
        if (typeof plots.palette === "string") setPalette(plots.palette);
        if (typeof plots.title_pca === "string") setTitlePca(plots.title_pca);
        if (typeof plots.title_volcano === "string") setTitleVolcano(plots.title_volcano);
        if (typeof plots.title_heatmap === "string") setTitleHeatmap(plots.title_heatmap);
        const venn = (opts.venn || {}) as { modes?: string[]; colors?: { up?: string; down?: string } };
        if (Array.isArray(venn.modes) && venn.modes.length) setVennModes(venn.modes);
        if (venn.colors?.up) setUpColor(venn.colors.up);
        if (venn.colors?.down) setDownColor(venn.colors.down);
        if (Array.isArray(opts.contrasts)) {
          const ids = (opts.contrasts as Array<{ id?: string }>).map((c) => String(c.id || "")).filter(Boolean);
          if (ids.length) setSelectedContrastIds(ids);
        }
      } catch {
        setErr("分组 JSON 解析失败");
      }
      return;
    }
    const rows = parseGroupsCsv(text);
    const names = Array.from(new Set(rows.map((r) => r.group)));
    const next: GroupCard[] = names.map((name, i) => ({
      id: uid("g"),
      name,
      role: guessRole(name, i),
      color: PALETTE[i % PALETTE.length],
      samples: rows.filter((r) => r.group === name).map((r) => r.sample),
    }));
    if (next.length) setGroups(next);
  }

  function updateGroup(id: string, patch: Partial<GroupCard>) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function removeGroup(id: string) {
    setGroups((prev) => (prev.length <= 1 ? prev : prev.filter((g) => g.id !== id)));
    if (selectedGroupId === id) setSelectedGroupId(null);
  }

  function addGroup() {
    const i = groups.length;
    const card: GroupCard = {
      id: uid("g"),
      name: `实验${String.fromCharCode(65 + Math.max(0, i - 1))}`,
      role: i === 0 ? "control" : "treatment",
      color: PALETTE[i % PALETTE.length],
      samples: [],
    };
    setGroups((prev) => [...prev, card]);
    setSelectedGroupId(card.id);
  }

  function assignSample(sample: string, groupId: string | null) {
    setGroups((prev) =>
      prev.map((g) => {
        const without = g.samples.filter((s) => s !== sample);
        if (groupId && g.id === groupId) return { ...g, samples: [...without, sample] };
        return { ...g, samples: without };
      }),
    );
  }

  function toggleVennMode(id: string) {
    setVennModes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleContrast(id: string) {
    setSelectedContrastIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function buildConfigBlob() {
    const formats = ["png"];
    if (exportPdf) formats.push("pdf");
    if (exportSvg) formats.push("svg");
    const payload = {
      version: 1,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        role: g.role,
        color: g.color,
        samples: g.samples,
      })),
      options: {
        species,
        lfc,
        padj,
        de_engine: deEngine,
        plots: {
          pca: plotPca,
          volcano: plotVolcano,
          heatmap: plotHeatmap,
          venn: plotVenn,
          dpi,
          formats,
          palette,
          title_pca: titlePca,
          title_volcano: titleVolcano,
          title_heatmap: titleHeatmap,
        },
        venn: {
          modes: vennModes,
          contrasts: null,
          colors: { up: upColor, down: downColor },
        },
        contrasts: activeContrasts.map((c) => ({
          id: c.id,
          treatment: c.treatment,
          control: c.control,
          label: c.label,
        })),
      },
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  }

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
    if (!matrix) {
      setErr("请上传表达矩阵");
      return;
    }
    if (!groups.some((g) => g.role === "control" && g.samples.length >= 2)) {
      setErr("请配置至少一个对照分组，且至少 2 个样本");
      return;
    }
    if (activeContrasts.length < 1) {
      setErr("请至少勾选一个对照×实验对比");
      return;
    }
    if (plotVenn && vennModes.length === 0) {
      setErr("已开启维恩图时，请至少勾选一种维恩模式");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("matrix", matrix);
      fd.set("groups", buildConfigBlob(), "analysis_config.json");
      fd.set("species", species);
      fd.set("lfc", String(lfc));
      fd.set("padj", String(padj));
      const res = await fetch("/api/tools/rnaseq", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok && !data.job) {
        setErr(data.error || "提交失败");
        return;
      }
      let current: Job | null = data.job || null;
      setJob(current);
      // poll until terminal
      const started = Date.now();
      while (
        current &&
        (current.status === "queued" || current.status === "running") &&
        Date.now() - started < 60 * 60 * 1000
      ) {
        await new Promise((r) => setTimeout(r, 1200));
        const poll = await fetch(`/api/tools/rnaseq?id=${encodeURIComponent(current.id)}`);
        const body = await poll.json();
        if (!poll.ok || !body.job) {
          setErr(body.error || "轮询任务失败");
          break;
        }
        current = body.job as Job;
        setJob(current);
      }
      if (current?.status === "failed") setErr(current.error || "分析失败");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  const activeGroup = groups.find((g) => g.id === selectedGroupId) || null;

  return (
    <div className="rnaseq-studio">
      {!loggedIn ? (
        <p className="rules-banner">
          请先 <Link href="/login">登录</Link> / <Link href="/register">注册试用</Link>。
        </p>
      ) : !entitled ? (
        <p className="rules-banner">
          当前账号无权运行分析。请确认校园认证与会员状态，见 <Link href="/account">我的账户</Link>。
        </p>
      ) : null}

      <form className="rnaseq-form" onSubmit={onSubmit}>
        <section className="rnaseq-panel">
          <div className="rnaseq-panel-head">
            <h2>1. 表达矩阵</h2>
            <p>CSV/TSV，首列 gene_id，其余列为样本。上传后自动识别样本名。</p>
          </div>
          <label className="rnaseq-file">
            <span>选择矩阵文件</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              required
              onChange={(e) => void onMatrixChange(e.target.files?.[0] || null)}
            />
          </label>
          {samples.length ? (
            <p className="form-note mono">
              已识别 {samples.length} 个样本
              {matrix ? ` · ${matrix.name}` : ""}
            </p>
          ) : null}
          <label className="rnaseq-file rnaseq-file-secondary">
            <span>可选：导入已有分组 CSV / JSON（预填卡片）</span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.json,text/csv,application/json"
              onChange={(e) => void onGroupsFile(e.target.files?.[0] || null)}
            />
          </label>
        </section>

        <section className="rnaseq-panel">
          <div className="rnaseq-panel-head">
            <h2>2. 分组卡片</h2>
            <p>拖拽样本到卡片，或先点选卡片再点样本。每组可改名、角色与展示色。</p>
          </div>

          <div className="rnaseq-sample-pool">
            <div className="rnaseq-pool-title">
              未分配样本 · 拖到下方卡片，或点选卡片后点击样本
            </div>
            <div className="rnaseq-chips">
              {unassigned.length === 0 ? (
                <span className="form-note">{samples.length ? "样本已全部分配" : "请先上传矩阵"}</span>
              ) : (
                unassigned.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rnaseq-chip"
                    draggable
                    onDragStart={() => setDragSample(s)}
                    onDragEnd={() => {
                      setDragSample(null);
                      setDropTarget(null);
                    }}
                    disabled={!activeGroup && !dragSample}
                    onClick={() => activeGroup && assignSample(s, activeGroup.id)}
                    title={activeGroup ? `归入「${activeGroup.name}」` : "可拖拽到分组卡，或先点选一张卡"}
                  >
                    {s}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rnaseq-group-grid">
            {groups.map((g) => (
              <article
                key={g.id}
                className={`rnaseq-group-card${selectedGroupId === g.id ? " is-active" : ""}${
                  dropTarget === g.id ? " is-drop" : ""
                }`}
                style={{ ["--group-accent" as string]: g.color }}
                onClick={() => setSelectedGroupId(g.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(g.id);
                }}
                onDragLeave={() => setDropTarget((cur) => (cur === g.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragSample) assignSample(dragSample, g.id);
                  setDragSample(null);
                  setDropTarget(null);
                }}
              >
                <header className="rnaseq-group-card-head">
                  <input
                    className="rnaseq-group-name"
                    value={g.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                    aria-label="分组名称"
                  />
                  <button
                    type="button"
                    className="rnaseq-icon-btn"
                    title="删除分组"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeGroup(g.id);
                    }}
                  >
                    ×
                  </button>
                </header>

                <label className="rnaseq-inline-field" onClick={(e) => e.stopPropagation()}>
                  角色
                  <select
                    value={g.role}
                    onChange={(e) => updateGroup(g.id, { role: e.target.value as GroupRole })}
                  >
                    <option value="control">对照 control</option>
                    <option value="treatment">实验 treatment</option>
                    <option value="custom">自定义 custom</option>
                  </select>
                </label>

                <div className="rnaseq-color-row" onClick={(e) => e.stopPropagation()}>
                  <span>展示色</span>
                  <div className="rnaseq-swatches">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`rnaseq-swatch${g.color === c ? " is-on" : ""}`}
                        style={{ background: c }}
                        aria-label={`颜色 ${c}`}
                        onClick={() => updateGroup(g.id, { color: c })}
                      />
                    ))}
                    <input
                      type="color"
                      value={g.color}
                      onChange={(e) => updateGroup(g.id, { color: e.target.value })}
                      title="自定义颜色"
                    />
                  </div>
                </div>

                <div className="rnaseq-card-samples">
                  {g.samples.length === 0 ? (
                    <span className="form-note">拖拽样本到此，或点选后点样本</span>
                  ) : (
                    g.samples.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="rnaseq-chip is-assigned"
                        style={{ borderColor: g.color, background: `${g.color}22` }}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          setDragSample(s);
                        }}
                        onDragEnd={() => {
                          setDragSample(null);
                          setDropTarget(null);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          assignSample(s, null);
                        }}
                        title="拖到其他组，或点击移回未分配"
                      >
                        {s} ×
                      </button>
                    ))
                  )}
                </div>
                <footer className="rnaseq-card-foot mono">
                  n={g.samples.length}
                  {g.samples.length < 2 ? " · 需 ≥2" : ""}
                </footer>
              </article>
            ))}
          </div>

          <div className="actions">
            <button type="button" className="btn" onClick={addGroup}>
              + 添加分组
            </button>
          </div>

          <div className="rnaseq-contrast-preview">
            <h3>对比选择（将实际运行）</h3>
            {allContrasts.length === 0 ? (
              <p className="form-note">配置对照 + 至少一个实验/自定义组后，可勾选 pairwise 对比。</p>
            ) : (
              <>
                <div className="rnaseq-contrast-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSelectedContrastIds(allContrasts.map((c) => c.id))}
                  >
                    全选
                  </button>
                  <button type="button" className="btn" onClick={() => setSelectedContrastIds([])}>
                    清空
                  </button>
                </div>
                <div className="rnaseq-contrast-grid">
                  {allContrasts.map((c) => (
                    <label
                      key={c.id}
                      className={`rnaseq-contrast-card${selectedContrastIds.includes(c.id) ? " is-on" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedContrastIds.includes(c.id)}
                        onChange={() => toggleContrast(c.id)}
                      />
                      <span className="mono">{c.label}</span>
                    </label>
                  ))}
                </div>
                <p className="form-note mono">已选 {activeContrasts.length} / {allContrasts.length}</p>
              </>
            )}
          </div>
        </section>

        <section className="rnaseq-panel">
          <div className="rnaseq-panel-head">
            <h2>3. 分析参数</h2>
            <p>DE 引擎、阈值、图题、DPI、色盲友好色板与导出格式均可调。</p>
          </div>

          <div className="rnaseq-options-grid">
            <label>
              |log2FC| 阈值
              <input type="number" step="0.1" min="0" value={lfc} onChange={(e) => setLfc(Number(e.target.value))} />
            </label>
            <label>
              padj 阈值
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={padj}
                onChange={(e) => setPadj(Number(e.target.value))}
              />
            </label>
            <label>
              物种注释
              <select value={species} onChange={(e) => setSpecies(e.target.value)}>
                <option value="none">none（跳过富集）</option>
                <option value="demo">demo（内置夹具注释）</option>
                <option value="human">human（需本地 annotations/human）</option>
                <option value="mouse">mouse（需本地 annotations/mouse）</option>
                <option value="arabidopsis">arabidopsis（需本地 annotations）</option>
              </select>
            </label>
            <label>
              DE 引擎
              <select value={deEngine} onChange={(e) => setDeEngine(e.target.value)}>
                <option value="auto">auto（优先本机 R limma → limma_like → Welch）</option>
                <option value="r_limma">r_limma（Bioconductor limma，需 R）</option>
                <option value="r_edger">r_edger（edgeR，需 R + counts）</option>
                <option value="r_deseq2">r_deseq2（DESeq2，需 R + counts）</option>
                <option value="limma_like">limma_like（Python moderated t）</option>
                <option value="welch">welch（备选）</option>
                <option value="pydeseq2">pydeseq2（pip 可选；需 counts）</option>
              </select>
            </label>
            <label>
              上调色
              <input type="color" value={upColor} onChange={(e) => setUpColor(e.target.value)} />
            </label>
            <label>
              下调色
              <input type="color" value={downColor} onChange={(e) => setDownColor(e.target.value)} />
            </label>
            <label>
              DPI
              <input type="number" min="72" max="600" step="10" value={dpi} onChange={(e) => setDpi(Number(e.target.value))} />
            </label>
            <label>
              色板
              <select value={palette} onChange={(e) => setPalette(e.target.value)}>
                <option value="okabe_ito">Okabe–Ito（色盲友好）</option>
                <option value="tol_bright">Tol Bright</option>
                <option value="colorblind">colorblind</option>
                <option value="default">default</option>
              </select>
            </label>
            <label>
              PCA 标题
              <input value={titlePca} onChange={(e) => setTitlePca(e.target.value)} />
            </label>
            <label>
              火山图标题
              <input value={titleVolcano} onChange={(e) => setTitleVolcano(e.target.value)} />
            </label>
            <label>
              热图标题
              <input value={titleHeatmap} onChange={(e) => setTitleHeatmap(e.target.value)} />
            </label>
          </div>

          <div className="rnaseq-check-row">
            <label>
              <input type="checkbox" checked={plotPca} onChange={(e) => setPlotPca(e.target.checked)} /> PCA
            </label>
            <label>
              <input type="checkbox" checked={plotVolcano} onChange={(e) => setPlotVolcano(e.target.checked)} /> 火山图
            </label>
            <label>
              <input type="checkbox" checked={plotHeatmap} onChange={(e) => setPlotHeatmap(e.target.checked)} /> 热图
            </label>
            <label>
              <input type="checkbox" checked={plotVenn} onChange={(e) => setPlotVenn(e.target.checked)} /> 维恩图
            </label>
            <label>
              <input type="checkbox" checked={exportPdf} onChange={(e) => setExportPdf(e.target.checked)} /> 导出 PDF
            </label>
            <label>
              <input type="checkbox" checked={exportSvg} onChange={(e) => setExportSvg(e.target.checked)} /> 导出 SVG
            </label>
          </div>

          {plotVenn ? (
            <div className="rnaseq-venn-modes">
              <h3>维恩模式</h3>
              <div className="rnaseq-venn-grid">
                {VENN_MODE_OPTIONS.map((m) => (
                  <label key={m.id} className={`rnaseq-venn-card${vennModes.includes(m.id) ? " is-on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={vennModes.includes(m.id)}
                      onChange={() => toggleVennMode(m.id)}
                    />
                    <strong>{m.label}</strong>
                    <span>{m.hint}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <p className="form-note">
          主路径只需<strong>矩阵 + 此处分组与勾选对比</strong>。差异分析、可视化与维恩由系统自动完成并打包；结果含{" "}
          <span className="mono">methods.json</span> 记录实际 DE 引擎。
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
            {job.message ? ` · ${job.message}` : ""}
            {job.status === "queued" || job.status === "running" ? " · 轮询中…" : ""}
            {job.summary
              ? ` · genes=${job.summary.n_genes ?? "?"} samples=${job.summary.n_samples ?? "?"} up=${job.summary.n_up ?? "?"} down=${job.summary.n_down ?? "?"} contrasts=${job.summary.n_contrasts ?? "?"} engine=${job.summary.de_engine || "?"} control=${job.summary.control_label || "?"} treatments=${job.summary.treatment_label || "?"} enrichment=${job.summary.enrichment || "?"}`
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
