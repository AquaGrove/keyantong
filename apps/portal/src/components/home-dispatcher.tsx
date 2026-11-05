"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  next?: { href: string; label: string } | null;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function HomeDispatcher({
  loggedIn,
  entitled,
}: {
  loggedIn: boolean;
  entitled: boolean;
}) {
  const { t, locale } = useI18n();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setMsgs((prev) => {
      // Keep conversation; only seed when empty
      if (prev.some((m) => m.role === "user")) return prev;
      return [
        { id: "welcome", role: "assistant", text: t("home.chat.welcome") },
        { id: "hint", role: "system", text: t("home.chat.loginHint") },
      ];
    });
  }, [t, locale]);

  useEffect(() => {
    if (msgs.some((m) => m.role === "user")) {
      const thread = bottomRef.current?.parentElement;
      thread?.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    }
  }, [msgs, busy]);

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setMsgs((m) => [...m, { id: uid(), role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/dispatch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          locale,
          enhance: entitled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err =
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
        setError(err);
        setMsgs((m) => [...m, { id: uid(), role: "assistant", text: err }]);
      } else {
        setMsgs((m) => [
          ...m,
          {
            id: uid(),
            role: "assistant",
            text: String(data.reply || "").trim(),
            next: data.next || null,
          },
        ]);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [
    {
      key: "home.suggest.rnaseq",
      textZh: "我想分析转录组数据",
      textEn: "I want to analyze RNA-seq data",
    },
    {
      key: "home.suggest.ncbi",
      textZh: "帮我准备 NCBI 数据上传",
      textEn: "Help me prepare an NCBI upload",
    },
    {
      key: "home.suggest.tools",
      textZh: "我想分享一个好用的科研工具",
      textEn: "I want to share a useful research tool",
    },
    {
      key: "home.suggest.community",
      textZh: "我需要文献求助",
      textEn: "I need literature help",
    },
  ] as const;

  return (
    <section className="home-dispatch" aria-label="AI dispatcher">
      <div className="home-dispatch-card">
        <div className="dispatch-heading">
          <span className="dispatch-symbol" aria-hidden="true">
            ✳
          </span>
          <div>
            <strong>
              {locale === "zh" ? "科研助手" : "Research assistant"}
            </strong>
            <span>
              {locale === "zh"
                ? "从一个问题，开始下一步探索"
                : "A question is the start of your next discovery"}
            </span>
          </div>
          <span className="dispatch-mode">
            {locale === "zh" ? "需求导航" : "Research guide"}
          </span>
        </div>
        {loggedIn || entitled ? (
          <div className="home-dispatch-top">
            <span className={`ai-pill ${entitled ? "is-ok" : "is-warn"}`}>
              {entitled
                ? locale === "zh"
                  ? "会员 · 可增强"
                  : "Member · LLM on"
                : locale === "zh"
                  ? "已登录"
                  : "Signed in"}
            </span>
          </div>
        ) : null}

        <div className="home-thread" aria-live="polite">
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
              <div className="home-msg-text">{m.text}</div>
              {m.next ? (
                <div className="home-next-row">
                  <Link
                    className="btn btn-primary home-next-btn"
                    href={m.next.href}
                  >
                    {t("home.chat.next")} · {m.next.label}
                  </Link>
                </div>
              ) : null}
            </div>
          ))}
          {busy ? (
            <div className="ai-msg ai-msg-system">
              {t("home.chat.thinking")}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div
          className="home-suggest"
          aria-label={locale === "zh" ? "试试这些问题" : "Try a question"}
        >
          {suggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              className="chip home-suggest-chip"
              disabled={busy}
              onClick={() => void send(locale === "zh" ? s.textZh : s.textEn)}
            >
              {t(s.key)}
            </button>
          ))}
        </div>

        <div className="ai-composer home-composer">
          <label className="ai-composer-solo" htmlFor="home-dispatch-input">
            <textarea
              id="home-dispatch-input"
              aria-label={
                locale === "zh"
                  ? "描述你的科研需求"
                  : "Describe your research need"
              }
              value={input}
              disabled={busy}
              placeholder={t("home.chat.placeholder")}
              rows={3}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (!busy && input.trim()) void send();
                }
              }}
            />
          </label>
          <div className="composer-footer">
            <p className="enter-hint">{t("home.chat.enterHint")}</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !input.trim()}
              onClick={() => void send()}
            >
              {busy ? t("home.chat.thinking") : t("home.chat.send")}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
          {error ? <p className="ai-error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
