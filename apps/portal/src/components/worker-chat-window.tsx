"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useI18n } from "@/lib/i18n";

type Agent = { id: string; name: string; kind: "worker" | "pet" };
type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  next?: { href: string; label: string } | null;
};

type Pos = { x: number; y: number };

const WIN_W = 400;
const WIN_H = 520;
const POS_KEY = "kt_worker_win_pos";
let zCounter = 90;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function clamp(x: number, y: number): Pos {
  if (typeof window === "undefined") return { x, y };
  const maxX = Math.max(
    8,
    window.innerWidth - Math.min(WIN_W, window.innerWidth - 16) - 8,
  );
  const maxY = Math.max(8, window.innerHeight - 120);
  return {
    x: Math.min(maxX, Math.max(8, x)),
    y: Math.min(maxY, Math.max(8, y)),
  };
}

/** Default: left side, clear of centered home chat + bottom Ask-AI fab. */
function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 24, y: 96 };
  return clamp(20, Math.max(72, Math.round(window.innerHeight * 0.12)));
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return defaultPos();
    const p = JSON.parse(raw) as Partial<Pos>;
    if (typeof p.x === "number" && typeof p.y === "number")
      return clamp(p.x, p.y);
  } catch {
    /* ignore */
  }
  return defaultPos();
}

export function WorkerChatWindow({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos>({ x: 24, y: 96 });
  const [ready, setReady] = useState(false);
  const [z, setZ] = useState(90);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    setPos(loadPos());
    zCounter += 1;
    setZ(zCounter);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/workers/${agent.id}`, {
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!res.ok || cancelled) return;
        const history = (data.memory?.messages || []) as {
          role: string;
          content: string;
        }[];
        const seeded: Msg[] = [
          {
            id: "sys",
            role: "system",
            text:
              locale === "zh"
                ? `已召唤「${agent.name}」。可拖动标题栏移动窗口。你的研究目标与近期对话会用于个性化协作。助手会提供建议与入口，实际分析和提交以对应模块状态为准。`
                : `Summoned “${agent.name}”. Drag the title bar. Your goals and recent conversations guide this role. Actions run in their respective modules.`,
          },
          ...history.slice(-16).map((m, i) => ({
            id: `h-${i}`,
            role: (m.role === "assistant" ? "assistant" : "user") as
              | "user"
              | "assistant",
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
              text:
                locale === "zh"
                  ? `已召唤「${agent.name}」`
                  : `Summoned “${agent.name}”`,
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
    const thread = bottomRef.current?.parentElement;
    thread?.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  function bringFront() {
    zCounter += 1;
    setZ(zCounter);
  }

  function onHeadDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button,a,input,textarea")) return;
    bringFront();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHeadMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setPos(
      clamp(d.origX + (e.clientX - d.startX), d.origY + (e.clientY - d.startY)),
    );
  }

  function onHeadUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setPos((p) => {
      const next = clamp(p.x, p.y);
      localStorage.setItem(POS_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setMsgs((m) => [...m, { id: uid(), role: "user", text }]);
    setBusy(true);
    bringFront();
    try {
      const res = await fetch(`/api/workers/${agent.id}/chat`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, locale }),
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
            text: String(data.reply || "").trim() || "（空）",
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

  return (
    <div
      className={`worker-window${ready ? " worker-window-ready" : ""}`}
      role="dialog"
      aria-label={agent.name}
      style={
        ready
          ? {
              left: pos.x,
              top: pos.y,
              right: "auto",
              bottom: "auto",
              zIndex: z,
            }
          : { zIndex: z }
      }
      onMouseDown={bringFront}
    >
      <div
        className="worker-window-head worker-window-drag"
        onPointerDown={onHeadDown}
        onPointerMove={onHeadMove}
        onPointerUp={onHeadUp}
        onPointerCancel={onHeadUp}
      >
        <strong>
          {agent.kind === "pet" ? "🐾" : "👷"} {agent.name}
          <span className="worker-drag-hint">
            {locale === "zh" ? " · 拖动" : " · drag"}
          </span>
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
            {locale === "zh" ? "思考中…" : "Thinking…"}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <div className="worker-composer">
        <textarea
          aria-label={
            locale === "zh" ? "发送给角色的消息" : "Message your worker"
          }
          value={input}
          disabled={busy}
          rows={3}
          placeholder={
            locale === "zh" ? "跟打工人说点什么…" : "Talk to your worker…"
          }
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !input.trim()}
          onClick={() => void send()}
        >
          {busy
            ? locale === "zh"
              ? "思考中…"
              : "Thinking…"
            : t("home.chat.send")}
        </button>
        <p className="enter-hint mono">
          {locale === "zh"
            ? "Enter 发送 · Shift+Enter 换行"
            : "Enter send · Shift+Enter newline"}
        </p>
        {error ? <p className="ai-error">{error}</p> : null}
      </div>
    </div>
  );
}
