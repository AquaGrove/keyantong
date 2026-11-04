"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Agent = { id: string; name: string; kind: "worker" | "pet" };
type Msg = { id: string; role: "user" | "assistant" | "system"; text: string };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function WorkerChatWindow({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const { locale } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workers/${agent.id}`, { credentials: "same-origin" });
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const history = (data.memory?.messages || []) as { role: string; content: string }[];
        const seeded: Msg[] = [
          {
            id: "sys",
            role: "system",
            text:
              locale === "zh"
                ? `已召唤「${agent.name}」。Enter 发送，Shift+Enter 换行。对话写入该角色独立记忆。`
                : `Summoned “${agent.name}”. Enter to send. Memory is private to this role.`,
          },
          ...history.slice(-16).map((m, i) => ({
            id: `h-${i}`,
            role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
            text: String(m.content || ""),
          })),
        ];
        setMsgs(seeded);
      } catch {
        if (!cancelled) {
          setMsgs([
            {
              id: "sys",
              role: "system",
              text: locale === "zh" ? `已召唤「${agent.name}」` : `Summoned “${agent.name}”`,
            },
          ]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agent.id, agent.name, locale]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setMsgs((m) => [...m, { id: uid(), role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch(`/api/workers/${agent.id}/chat`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        setError(err);
        setMsgs((m) => [...m, { id: uid(), role: "assistant", text: err }]);
      } else {
        setMsgs((m) => [
          ...m,
          { id: uid(), role: "assistant", text: String(data.reply || "").trim() || "（空）" },
        ]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="worker-window" role="dialog" aria-label={agent.name}>
      <div className="worker-window-head">
        <strong>
          {agent.kind === "pet" ? "🐾" : "👷"} {agent.name}
        </strong>
        <button type="button" className="linkish" onClick={onClose}>
          {locale === "zh" ? "关闭" : "Close"}
        </button>
      </div>
      <div className="worker-thread" aria-live="polite">
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
        {busy ? (
          <div className="ai-msg ai-msg-system">{locale === "zh" ? "思考中…" : "Thinking…"}</div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="worker-composer">
        <textarea
          value={input}
          disabled={busy}
          rows={3}
          placeholder={locale === "zh" ? "跟打工人说点什么…" : "Talk to your worker…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <p className="enter-hint mono">
          {locale === "zh" ? "Enter 发送 · Shift+Enter 换行" : "Enter send · Shift+Enter newline"}
        </p>
        {error ? <p className="ai-error">{error}</p> : null}
      </div>
    </div>
  );
}
