"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname } from "next/navigation";
import { LocaleToggle } from "@/components/locale-toggle";
import { WorkerChatWindow } from "@/components/worker-chat-window";
import { useI18n } from "@/lib/i18n";

type Agent = {
  id: string;
  name: string;
  kind: "worker" | "pet";
  persona: string;
  skills: string[];
};

type Pos = { x: number; y: number };

const POS_KEY = "kt_ask_ai_pos";
const FAB_W = 148;
const FAB_H = 64;

function clampPos(x: number, y: number): Pos {
  if (typeof window === "undefined") return { x, y };
  const maxX = Math.max(8, window.innerWidth - FAB_W - 8);
  const maxY = Math.max(8, window.innerHeight - FAB_H - 8);
  return {
    x: Math.min(maxX, Math.max(8, x)),
    y: Math.min(maxY, Math.max(8, y)),
  };
}

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  return clampPos(
    window.innerWidth - FAB_W - 24,
    window.innerHeight - FAB_H - 24,
  );
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return defaultPos();
    const parsed = JSON.parse(raw) as Partial<Pos>;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") {
      return clampPos(parsed.x, parsed.y);
    }
  } catch {
    /* ignore */
  }
  return defaultPos();
}

/** Inline cute helper — original SVG, no external assets. */
function CuteHelperIcon() {
  return (
    <svg
      className="ask-who-avatar"
      viewBox="0 0 64 64"
      width="40"
      height="40"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="30" fill="#99f6e4" />
      <circle cx="32" cy="34" r="22" fill="#ecfeff" />
      <ellipse cx="32" cy="48" rx="14" ry="8" fill="#5eead4" opacity="0.55" />
      <circle cx="23" cy="30" r="5.2" fill="#0f766e" />
      <circle cx="41" cy="30" r="5.2" fill="#0f766e" />
      <circle cx="24.6" cy="28.6" r="1.7" fill="#fff" />
      <circle cx="42.6" cy="28.6" r="1.7" fill="#fff" />
      <path
        d="M24 40c3.2 4.2 12.8 4.2 16 0"
        fill="none"
        stroke="#0f766e"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="14" cy="36" r="3.2" fill="#f472b6" opacity="0.75" />
      <circle cx="50" cy="36" r="3.2" fill="#f472b6" opacity="0.75" />
      <path
        d="M20 16c2-6 8-9 12-9s10 3 12 9"
        fill="none"
        stroke="#14b8a6"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="20" cy="16" r="3.5" fill="#2dd4bf" />
      <circle cx="44" cy="16" r="3.5" fill="#2dd4bf" />
    </svg>
  );
}

export function AskWho({ loggedIn }: { loggedIn: boolean }) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [active, setActive] = useState<Agent | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos>({ x: 24, y: 24 });
  const [ready, setReady] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const [auth, setAuth] = useState<"unknown" | "in" | "out">(
    loggedIn ? "in" : "unknown",
  );
  const [loadingAgents, setLoadingAgents] = useState(false);

  const load = useCallback(async () => {
    setLoadingAgents(true);
    setErr(null);
    try {
      const res = await fetch("/api/workers", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.status === 401) {
        setAuth("out");
        setAgents([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        agents?: Agent[];
        workers?: Agent[];
        error?: string;
      };
      const list = Array.isArray(data.agents)
        ? data.agents
        : Array.isArray(data.workers)
          ? data.workers
          : [];
      setAuth("in");
      setAgents(
        list
          .map((a) => {
            const kind: Agent["kind"] = a.kind === "pet" ? "pet" : "worker";
            return {
              id: String(a.id || ""),
              name: String(a.name || "未命名"),
              kind,
              persona: String(a.persona || ""),
              skills: Array.isArray(a.skills) ? a.skills.map(String) : [],
            };
          })
          .filter((a) => a.id),
      );
      if (!res.ok) {
        setErr(
          typeof data.error === "string"
            ? data.error
            : `加载失败 HTTP ${res.status}`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载打工人失败");
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  useEffect(() => {
    setPos(loadPos());
    setReady(true);
  }, []);

  useEffect(() => {
    // Always probe session + workers when panel opens (do not trust SSR loggedIn alone).
    if (open) void load();
  }, [load, open]);

  useEffect(() => {
    // Warm list once after mount if SSR already thinks we are signed in.
    if (loggedIn) void load();
  }, [loggedIn, load]);

  useEffect(() => {
    function onResize() {
      setPos((p) => {
        const next = clampPos(p.x, p.y);
        localStorage.setItem(POS_KEY, JSON.stringify(next));
        return next;
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const label = t("askwho.label");
  const isHome = pathname === "/";

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy < 36) return;
    d.moved = true;
    setPos(clampPos(d.origX + dx, d.origY + dy));
  }

  function onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    if (d.moved) {
      setPos((p) => {
        const next = clampPos(p.x, p.y);
        localStorage.setItem(POS_KEY, JSON.stringify(next));
        return next;
      });
      return;
    }
    setOpen((v) => !v);
    setErr(null);
  }

  const panelStyle: CSSProperties = {
    left:
      typeof window !== "undefined"
        ? Math.max(
            12,
            Math.min(
              pos.x,
              window.innerWidth - Math.min(420, window.innerWidth - 24) - 12,
            ),
          )
        : 12,
    top: "auto",
    bottom: "5.5rem",
    transform: "none",
  };

  return (
    <>
      <div
        className={`ask-who-dock${isHome ? " ask-who-dock-home" : ""}${ready ? " ask-who-dock-ready" : ""}`}
        style={
          ready
            ? {
                left: pos.x,
                top: pos.y,
                right: "auto",
                bottom: "auto",
                transform: "none",
              }
            : undefined
        }
      >
        <button
          ref={fabRef}
          type="button"
          className="ask-who-fab"
          aria-expanded={open}
          aria-label={label}
          title={
            locale === "zh"
              ? "拖动可改位置；点击打开"
              : "Drag to move; click to open"
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <CuteHelperIcon />
          <span className="ask-who-fab-text">{label}</span>
        </button>
      </div>

      {open ? (
        <div
          className="ask-who-panel"
          role="dialog"
          aria-label={label}
          style={ready ? panelStyle : undefined}
        >
          <div className="ask-who-panel-head">
            <strong>{label}</strong>
            <button
              type="button"
              className="linkish"
              onClick={() => setOpen(false)}
            >
              {locale === "zh" ? "关闭" : "Close"}
            </button>
          </div>

          <div className="ask-who-section">
            <p className="ask-who-label">
              {locale === "zh" ? "快捷" : "Quick"}
            </p>
            <Link
              className="ask-who-item"
              href="/"
              onClick={() => setOpen(false)}
            >
              {locale === "zh" ? "回首页对话" : "Home dispatcher"}
            </Link>
            <Link
              className="ask-who-item"
              href="/literature"
              onClick={() => setOpen(false)}
            >
              {t("nav.literature")}
            </Link>
            <Link
              className="ask-who-item"
              href="/tools"
              onClick={() => setOpen(false)}
            >
              {t("nav.tools")}
            </Link>
            <Link
              className="ask-who-item"
              href="/analysis"
              onClick={() => setOpen(false)}
            >
              {t("nav.analysis")}
            </Link>
            <Link
              className="ask-who-item"
              href="/community"
              onClick={() => setOpen(false)}
            >
              {t("nav.community")}
            </Link>
            {auth === "out" || (auth !== "in" && !loggedIn) ? (
              <>
                <Link
                  className="ask-who-item"
                  href="/login"
                  onClick={() => setOpen(false)}
                >
                  {t("nav.login")}
                </Link>
                <Link
                  className="ask-who-item"
                  href="/register"
                  onClick={() => setOpen(false)}
                >
                  {t("nav.register")}
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="ask-who-item"
                  href="/account"
                  onClick={() => setOpen(false)}
                >
                  {t("nav.account")}
                </Link>
                <Link
                  className="ask-who-item"
                  href="/notifications"
                  onClick={() => setOpen(false)}
                >
                  {t("nav.notifications")}
                </Link>
              </>
            )}
            <div className="ask-who-locale">
              <LocaleToggle />
            </div>
          </div>

          <div className="ask-who-section">
            <p className="ask-who-label">
              {locale === "zh" ? "我的打工人 / 宠物" : "My workers / pets"}
              {loadingAgents ? (
                <span className="mono">
                  {" "}
                  · {locale === "zh" ? "加载中…" : "loading…"}
                </span>
              ) : null}
            </p>
            {auth === "out" ||
            (auth === "unknown" && !loggedIn && !loadingAgents) ? (
              <p className="mono">
                {locale === "zh"
                  ? "登录后可召唤专属角色"
                  : "Sign in to summon roles"}
              </p>
            ) : loadingAgents && agents.length === 0 ? (
              <p className="mono">
                {locale === "zh"
                  ? "正在加载已创建角色…"
                  : "Loading your roles…"}
              </p>
            ) : agents.length === 0 ? (
              <p className="mono">
                {locale === "zh"
                  ? "还没有角色 — 可下方添加"
                  : "None yet — add below"}
              </p>
            ) : (
              <ul className="ask-who-list">
                {agents.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="ask-who-item ask-who-summon"
                      onClick={() => {
                        setActive(a);
                        setOpen(false);
                      }}
                    >
                      <span>
                        {a.kind === "pet" ? "🐾" : "👷"} {a.name}
                      </span>
                      <em>
                        {(a.skills || []).slice(0, 2).join(" · ") ||
                          (a.persona || "").slice(0, 28) ||
                          (locale === "zh" ? "点击召唤" : "Summon")}
                      </em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {auth === "in" || loggedIn ? (
              <Link
                className="ask-who-item ask-who-add"
                href="/#workers"
                onClick={() => setOpen(false)}
              >
                {locale === "zh" ? "+ 添加我的打工人" : "+ Add a worker"}
              </Link>
            ) : null}
            {err ? <p className="ai-error">{err}</p> : null}
          </div>
        </div>
      ) : null}

      {active ? (
        <WorkerChatWindow agent={active} onClose={() => setActive(null)} />
      ) : null}
    </>
  );
}
