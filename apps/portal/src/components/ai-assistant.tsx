"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Scene = "faq" | "chat" | "tool_help" | "rag_draft" | "deep_troubleshoot";

type Quota = {
  pointsUsed?: number;
  pointsBudget?: number;
  callsUsed?: number;
  callsBudget?: number;
  reasoningUsed?: number;
  reasoningCap?: number;
};

type StatusPayload = {
  configured?: boolean;
  entitled?: boolean;
  models?: { fast?: string; default?: string; reasoning?: string };
  coefficients?: Record<string, number>;
  pointsBudget?: number;
  quota?: Quota | null;
  error?: string;
};

type Msg = { id: string; role: "user" | "assistant" | "system"; text: string };

const SCENES: { id: Scene; label: string; hint: string }[] = [
  { id: "faq", label: "FAQ", hint: "短答、产品与合规常见问题" },
  { id: "chat", label: "闲聊协助", hint: "一般科研工具与流程咨询" },
  { id: "tool_help", label: "工具说明", hint: "RNAseq / NCBI / 工具卡用法" },
  { id: "rag_draft", label: "草稿整理", hint: "基于你粘贴的事实整理说明" },
  { id: "deep_troubleshoot", label: "深度排错", hint: "推理档，额度更贵" },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AiAssistant({
  loggedIn,
  entitled,
}: {
  loggedIn: boolean;
  entitled: boolean;
}) {
  const [scene, setScene] = useState<Scene>("chat");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: "sys-0",
      role: "system",
      text: "助手只回答短文本与已脱敏事实；不会接收测序大文件，也不会把 Key 暴露到浏览器。",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const res = await fetch("/api/ai/status", { credentials: "same-origin" });
      const data = (await res.json()) as StatusPayload;
      if (!res.ok) {
        setStatus({ error: data.error || `状态 ${res.status}` });
        return;
      }
      setStatus(data);
    } catch (e) {
      setStatus({ error: String(e) });
    }
  }, [loggedIn]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  const quotaLabel = useMemo(() => {
    const q = status?.quota;
    if (!q) return null;
    const pts = `${q.pointsUsed ?? 0}/${q.pointsBudget ?? status?.pointsBudget ?? "—"} 点`;
    const calls = `${q.callsUsed ?? 0}/${q.callsBudget ?? "—"} 次`;
    return `${pts} · ${calls}`;
  }, [status]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const userMsg: Msg = { id: uid(), role: "user", text };
    setMsgs((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `请求失败 ${res.status}`);
        setMsgs((m) => [
          ...m,
          {
            id: uid(),
            role: "assistant",
            text: typeof data.error === "string" ? data.error : "暂时无法回答，请稍后再试。",
          },
        ]);
      } else {
        setMsgs((m) => [
          ...m,
          {
            id: uid(),
            role: "assistant",
            text: String(data.reply || "").trim() || "（空回复）",
          },
        ]);
        if (data.quota) {
          setStatus((s) => ({ ...(s || {}), quota: data.quota, entitled: true }));
        } else {
          void refreshStatus();
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loggedIn) {
    return (
      <section className="section">
        <h2>需要登录</h2>
        <p className="section-lead">登录后可使用科研通 AI 助手（校园试用或永久会员）。</p>
        <div className="actions">
          <a className="btn btn-primary" href="/login">
            去登录
          </a>
        </div>
      </section>
    );
  }

  if (!entitled) {
    return (
      <section className="section">
        <h2>需要会员权益</h2>
        <p className="section-lead">AI 助手仅对校园邮箱试用或永久会员开放。可先浏览工具目录与社区。</p>
        <div className="actions">
          <a className="btn btn-primary" href="/pricing">
            查看定价
          </a>
          <a className="btn btn-secondary" href="/tools">
            返回工具
          </a>
        </div>
      </section>
    );
  }

  return (
    <div className="ai-studio">
      <div className="ai-layout">
        <section className="ai-chat-panel" aria-label="对话">
          <h2>对话</h2>
          <div className="ai-meta">
            <span className={`ai-pill ${status?.configured ? "is-ok" : "is-warn"}`}>
              {status?.configured ? "网关已配置" : status?.error || "网关未就绪"}
            </span>
            {quotaLabel ? <span className="ai-pill">今日 {quotaLabel}</span> : null}
            <span className="ai-pill">场景 {SCENES.find((s) => s.id === scene)?.label}</span>
          </div>

          <div className="ai-scene-row" role="tablist" aria-label="场景">
            {SCENES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={scene === s.id ? "chip chip-on" : "chip"}
                onClick={() => setScene(s.id)}
                title={s.hint}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="ai-thread" aria-live="polite">
            {msgs.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "ai-msg ai-msg-user"
                    : m.role === "assistant"
                      ? "ai-msg ai-msg-assistant"
                      : "ai-msg ai-msg-system"
                }
              >
                {m.text}
              </div>
            ))}
            {busy ? <div className="ai-msg ai-msg-system">思考中…</div> : null}
            <div ref={bottomRef} />
          </div>

          <div className="ai-composer">
            <label className="ai-composer-row" htmlFor="ai-input">
              <textarea
                id="ai-input"
                value={input}
                disabled={busy || !status?.configured}
                placeholder="输入问题（勿粘贴测序原文、密钥或隐私标识）"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !input.trim() || !status?.configured}
                onClick={() => void send()}
              >
                发送
              </button>
            </label>
            {error ? <p className="ai-error">{error}</p> : null}
            <p className="mono" style={{ margin: 0, color: "var(--muted)", fontSize: "0.82rem" }}>
              ⌘/Ctrl + Enter 发送 · 点数 = ceil(tokens × 档位系数)
            </p>
          </div>
        </section>

        <aside className="ai-side-panel" aria-label="说明">
          <h2>使用边界</h2>
          <ul className="ai-side-list">
            <li>
              <strong>双账本额度</strong>
              用户侧看点数/次数；供应商侧记原始 token。推理档系数更高。
            </li>
            <li>
              <strong>不碰大文件</strong>
              NCBI 仍本机 ascp；RNAseq 大任务走 worker，助手只解释脱敏元数据。
            </li>
            <li>
              <strong>Key 不出浏览器</strong>
              仅服务端 LLM Gateway 持有供应商密钥；状态接口永不回传 Key。
            </li>
            <li>
              <strong>运维 Harness</strong>
              DeepSeek Harness 与 C 端助手隔离，默认需本机隧道 / Basic Auth。
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
