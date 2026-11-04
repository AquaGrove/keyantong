"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { WorkerChatWindow } from "@/components/worker-chat-window";

type Agent = {
  id: string;
  name: string;
  kind: "worker" | "pet";
  persona: string;
  skills: string[];
};

export function WorkerManager({ loggedIn }: { loggedIn: boolean }) {
  const { locale } = useI18n();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [skills, setSkills] = useState("");
  const [kind, setKind] = useState<"worker" | "pet">("worker");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [active, setActive] = useState<Agent | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!loggedIn) return;
    const res = await fetch("/api/workers", { credentials: "same-origin" });
    const data = await res.json();
    if (res.ok) setAgents(Array.isArray(data.agents) ? data.agents : []);
  }, [loggedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!loggedIn) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        credentials: "same-origin",
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
      const data = await res.json();
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "创建失败");
        return;
      }
      setMsg(locale === "zh" ? "已创建，可在任意页「去问谁」召唤" : "Created — summon via Ask who");
      setName("");
      setPersona("");
      setSkills("");
      setShowForm(false);
      await load();
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm(locale === "zh" ? "删除该角色及其记忆？" : "Delete this role and its memory?")) return;
    const res = await fetch(`/api/workers/${id}`, { method: "DELETE", credentials: "same-origin" });
    if (res.ok) await load();
  }

  if (!loggedIn) {
    return (
      <section className="section worker-home" id="workers">
        <h2>{locale === "zh" ? "我的打工人" : "My workers"}</h2>
        <p className="section-lead">
          {locale === "zh"
            ? "登录后可添加专属打工人或宠物：独立人设、擅长领域与记忆空间，全站「去问谁」随时召唤。"
            : "Sign in to add workers or pets with private persona, skills, and memory — summon from any page."}
        </p>
      </section>
    );
  }

  return (
    <section className="section worker-home" id="workers">
      <div className="worker-home-head">
        <h2>{locale === "zh" ? "我的打工人" : "My workers"}</h2>
        <button type="button" className="btn btn-secondary" onClick={() => setShowForm((v) => !v)}>
          {showForm
            ? locale === "zh"
              ? "收起"
              : "Close"
            : locale === "zh"
              ? "添加我的打工人"
              : "Add a worker"}
        </button>
      </div>
      <p className="section-lead">
        {locale === "zh"
          ? "每个角色有独立记忆与聊天窗。也可添加宠物同伴。在任意页点「去问谁」召唤。"
          : "Each role has private memory and a chat window. Add pets too. Summon via Ask who on any page."}
      </p>

      {showForm ? (
        <form className="help-form" onSubmit={onCreate}>
          <label>
            {locale === "zh" ? "类型" : "Kind"}
            <select value={kind} onChange={(e) => setKind(e.target.value as "worker" | "pet")} disabled={busy}>
              <option value="worker">{locale === "zh" ? "打工人" : "Worker"}</option>
              <option value="pet">{locale === "zh" ? "宠物" : "Pet"}</option>
            </select>
          </label>
          <label>
            {locale === "zh" ? "名称" : "Name"}
            <input value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} maxLength={40} />
          </label>
          <label>
            {locale === "zh" ? "角色设定" : "Persona"}
            <textarea
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              required
              disabled={busy}
              rows={4}
              placeholder={
                locale === "zh"
                  ? "例如：严谨的 RNA-seq 分析助理，擅长分组设计与结果解读"
                  : "e.g. Careful RNA-seq assistant for design & interpretation"
              }
            />
          </label>
          <label>
            {locale === "zh" ? "擅长（逗号分隔，可选）" : "Skills (comma-separated, optional)"}
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              disabled={busy}
              placeholder={locale === "zh" ? "转录组, NCBI, 文献检索" : "RNA-seq, NCBI, literature"}
            />
          </label>
          <button className="enter-submit-hidden" type="submit" disabled={busy}>
            create
          </button>
          <p className="enter-hint mono" aria-live="polite">
            {busy
              ? locale === "zh"
                ? "创建中…"
                : "Creating…"
              : locale === "zh"
                ? "按 Enter 创建"
                : "Press Enter to create"}
          </p>
          {err ? <p className="ai-error">{err}</p> : null}
          {msg ? <p className="form-note">{msg}</p> : null}
        </form>
      ) : null}

      {agents.length === 0 ? (
        <p className="mono">{locale === "zh" ? "暂无角色" : "No roles yet"}</p>
      ) : (
        <ul className="worker-card-list">
          {agents.map((a) => (
            <li key={a.id} className="worker-card">
              <div>
                <strong>
                  {a.kind === "pet" ? "🐾" : "👷"} {a.name}
                </strong>
                <p>{a.persona}</p>
                {a.skills.length ? <span className="mono">{a.skills.join(" · ")}</span> : null}
              </div>
              <div className="worker-card-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setActive(a)}>
                  {locale === "zh" ? "召唤聊天" : "Chat"}
                </button>
                <button type="button" className="linkish" onClick={() => void onDelete(a.id)}>
                  {locale === "zh" ? "删除" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {active ? <WorkerChatWindow agent={active} onClose={() => setActive(null)} /> : null}
    </section>
  );
}
