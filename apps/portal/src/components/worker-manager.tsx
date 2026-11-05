"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { WorkerChatWindow } from "@/components/worker-chat-window";
type Agent = {
  id: string;
  name: string;
  kind: "worker" | "pet";
  persona: string;
  skills: string[];
};
const PRESETS = [
  {
    icon: "◎",
    name: "文献搭子",
    en: "Literature partner",
    kind: "worker" as const,
    skills: "文献检索, 引用网络, 研究梳理",
    persona:
      "你是严谨的文献研究搭子。先了解我的研究方向和问题，再帮助设计检索策略、梳理论文证据与引用网络。只提供可核验线索，不编造引用。",
  },
  {
    icon: "≋",
    name: "组学助手",
    en: "Omics assistant",
    kind: "worker" as const,
    skills: "RNAseq, BSAseq, GWAS, 单细胞",
    persona:
      "你是我的组学分析助手。记住我的研究物种、数据类型与分析目标，优先检查样本设计、质控与统计假设，再制定可复现的分析方案。区分已运行结果与分析建议。",
  },
  {
    icon: "⌘",
    name: "排错搭档",
    en: "Debug partner",
    kind: "worker" as const,
    skills: "科研软件, 环境排错, 工作流",
    persona:
      "你是耐心的科研软件排错搭档。先询问系统、版本、报错和已尝试步骤，再给最小可验证的解决方案。记住我的环境约束，解释命令作用，不直接执行外部操作。",
  },
  {
    icon: "🐾",
    name: "实验室小伙伴",
    en: "Lab companion",
    kind: "pet" as const,
    skills: "科研陪伴, 日常记录, 目标拆解",
    persona:
      "你是温暖又有边界的实验室宠物同伴。记住我主动分享的研究目标与偏好，陪我记录进展、拆解小目标，在遇到瓶颈时鼓励我讨论可行思路，不编造记忆或实验结论。",
  },
];
export function WorkerManager({ loggedIn }: { loggedIn: boolean }) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runtime, setRuntime] = useState<{
    label: string;
    connected: boolean;
  } | null>(null);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [skills, setSkills] = useState("");
  const [kind, setKind] = useState<"worker" | "pet">("worker");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState<Agent | null>(null);
  const [show, setShow] = useState(false);
  const load = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const r = await fetch("/api/workers");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setAgents(data.agents || []);
      setRuntime(data.runtime);
    } catch (e) {
      setError(e instanceof Error ? e.message : "角色加载失败");
    }
  }, [loggedIn]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          persona,
          kind,
          skills: skills
            .split(/[,，、]/)
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "创建失败");
      setShow(false);
      setName("");
      setPersona("");
      setSkills("");
      setNotice(
        zh ? "角色已创建，可以开始你的专属对话。" : "Your role is ready.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (
      !confirm(
        zh
          ? "删除该角色及其门户聊天记录？"
          : "Delete this role and its portal history?",
      )
    )
      return;
    setError("");
    try {
      const r = await fetch(`/api/workers/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("删除失败");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }
  return (
    <section className="section worker-home worker-studio" id="workers">
      <div className="feed-heading">
        <div>
          <p className="page-kicker">YOUR PERSONAL RESEARCH CREW</p>
          <h2>
            {zh ? "你的专属打工人与宠物" : "Your research crew & companions"}
          </h2>
          <p>
            {zh
              ? "你定义角色，积累共同记忆。研究有人搭把手，日常也有人陪。"
              : "Define a role, build shared memories, and find a companion for your research."}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setShow((v) => !v)}
          aria-expanded={show}
        >
          {show
            ? zh
              ? "收起"
              : "Close"
            : zh
              ? "+ 自定义角色"
              : "+ Create a role"}
        </button>
      </div>
      {runtime ? (
        <p
          className={`runtime-status ${runtime.connected ? "is-connected" : ""}`}
        >
          <span aria-hidden="true">●</span> {runtime.label}
        </p>
      ) : null}
      <div className="role-presets">
        {PRESETS.map((p) => (
          <button
            className={`role-preset ${p.kind === "pet" ? "is-pet" : ""}`}
            type="button"
            key={p.name}
            onClick={() => {
              setName(zh ? p.name : p.en);
              setKind(p.kind);
              setSkills(p.skills);
              setPersona(p.persona);
              setShow(true);
            }}
          >
            <span className="role-avatar" aria-hidden="true">
              {p.icon}
            </span>
            <strong>{zh ? p.name : p.en}</strong>
            <span>
              {zh
                ? p.skills
                : p.kind === "pet"
                  ? "Notes & companionship"
                  : "Research support"}
            </span>
            <small>{zh ? "以此为起点 ↗" : "Start here ↗"}</small>
          </button>
        ))}
      </div>
      {show ? (
        loggedIn ? (
          <form className="help-form role-create" onSubmit={create}>
            <div className="form-columns">
              <label>
                {zh ? "角色类型" : "Role type"}
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "worker" | "pet")}
                  disabled={busy}
                >
                  <option value="worker">
                    {zh ? "科研打工人" : "Research worker"}
                  </option>
                  <option value="pet">
                    {zh ? "宠物同伴" : "Pet companion"}
                  </option>
                </select>
              </label>
              <label>
                {zh ? "给它一个名字" : "Name"}
                <input
                  required
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <label>
              {zh
                ? "人设、研究目标与协作偏好"
                : "Persona, research goals & preferences"}
              <textarea
                required
                maxLength={800}
                rows={5}
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                disabled={busy}
                placeholder="例如：研究马铃薯抗病机制，希望先检查实验设计再讨论分析，回答简明、优先给出可验证步骤。"
              />
            </label>
            <label>
              {zh ? "擅长领域（逗号分隔）" : "Skills (comma-separated)"}
              <input
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                maxLength={500}
                disabled={busy}
              />
            </label>
            <p className="form-note">
              {zh
                ? "角色与对话按账号独立保存，请只写入你愿意提供给助手的研究信息。"
                : "Each account has independent roles and conversations."}
            </p>
            <button className="btn btn-primary" disabled={busy}>
              {busy
                ? zh
                  ? "创建中…"
                  : "Creating…"
                : zh
                  ? "创建我的专属角色"
                  : "Create my role"}
            </button>
          </form>
        ) : (
          <div className="feed-signin">
            <p>
              {zh
                ? "登录后即可创建角色与独立记忆空间。智能对话按账户试用与会员额度使用。"
                : "Sign in to create roles. AI conversations use your account quota."}
            </p>
            <Link className="btn btn-primary" href="/login">
              {zh ? "登录，创建我的角色" : "Sign in"}
            </Link>
          </div>
        )
      ) : null}
      {error ? (
        <p className="ai-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="success-note" role="status">
          {notice}
        </p>
      ) : null}
      {agents.length ? (
        <div className="my-role-grid">
          {agents.map((a) => (
            <article className="my-role" key={a.id}>
              <div className="role-title">
                <span className="role-avatar" aria-hidden="true">
                  {a.kind === "pet" ? "🐾" : "✳"}
                </span>
                <div>
                  <h3>{a.name}</h3>
                  <span>
                    {a.kind === "pet"
                      ? zh
                        ? "宠物同伴"
                        : "Pet"
                      : zh
                        ? "专属打工人"
                        : "Worker"}
                  </span>
                </div>
              </div>
              <p>{a.persona}</p>
              <div className="analysis-tags">
                {a.skills.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <div className="actions">
                <button
                  className="btn btn-primary"
                  onClick={() => setActive(a)}
                >
                  {zh ? "开始协作 ↗" : "Chat ↗"}
                </button>
                <button className="linkish" onClick={() => void remove(a.id)}>
                  {zh ? "删除" : "Delete"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : loggedIn ? (
        <p className="form-note">
          {zh
            ? "还没有角色。选择一个模板，加入你的研究目标，就能开始。"
            : "Choose a template and add your research goals to get started."}
        </p>
      ) : null}
      {active ? (
        <WorkerChatWindow
          key={active.id}
          agent={active}
          onClose={() => setActive(null)}
        />
      ) : null}
    </section>
  );
}
