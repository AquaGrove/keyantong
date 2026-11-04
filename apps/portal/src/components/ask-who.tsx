"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

export function AskWho({ loggedIn }: { loggedIn: boolean }) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [active, setActive] = useState<Agent | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!loggedIn) {
      setAgents([]);
      return;
    }
    try {
      const res = await fetch("/api/workers", { credentials: "same-origin" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.agents)) setAgents(data.agents);
    } catch {
      /* ignore */
    }
  }, [loggedIn]);

  useEffect(() => {
    void load();
  }, [load, open]);

  const isHome = pathname === "/";
  const label = locale === "zh" ? "去问谁" : "Ask who";

  return (
    <>
      <div className={`ask-who-dock${isHome ? " ask-who-dock-home" : ""}`}>
        <button
          type="button"
          className="ask-who-fab"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            setErr(null);
          }}
        >
          {label}
        </button>
      </div>

      {open ? (
        <div className="ask-who-panel" role="dialog" aria-label={label}>
          <div className="ask-who-panel-head">
            <strong>{label}</strong>
            <button type="button" className="linkish" onClick={() => setOpen(false)}>
              {locale === "zh" ? "关闭" : "Close"}
            </button>
          </div>

          <div className="ask-who-section">
            <p className="ask-who-label">{locale === "zh" ? "快捷" : "Quick"}</p>
            <Link className="ask-who-item" href="/" onClick={() => setOpen(false)}>
              {locale === "zh" ? "回首页对话" : "Home dispatcher"}
            </Link>
            {!loggedIn ? (
              <>
                <Link className="ask-who-item" href="/login" onClick={() => setOpen(false)}>
                  {t("nav.login")}
                </Link>
                <Link className="ask-who-item" href="/register" onClick={() => setOpen(false)}>
                  {t("nav.register")}
                </Link>
              </>
            ) : (
              <>
                <Link className="ask-who-item" href="/account" onClick={() => setOpen(false)}>
                  {t("nav.account")}
                </Link>
                <Link className="ask-who-item" href="/notifications" onClick={() => setOpen(false)}>
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
            </p>
            {!loggedIn ? (
              <p className="mono">{locale === "zh" ? "登录后可召唤专属角色" : "Sign in to summon roles"}</p>
            ) : agents.length === 0 ? (
              <p className="mono">
                {locale === "zh" ? "还没有角色 — 回首页添加" : "None yet — add on home"}
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
                      <span>{a.kind === "pet" ? "🐾" : "👷"} {a.name}</span>
                      <em>{a.skills.slice(0, 2).join(" · ") || a.persona.slice(0, 28)}</em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {loggedIn ? (
              <Link className="ask-who-item ask-who-add" href="/#workers" onClick={() => setOpen(false)}>
                {locale === "zh" ? "+ 添加我的打工人" : "+ Add a worker"}
              </Link>
            ) : null}
            {err ? <p className="ai-error">{err}</p> : null}
          </div>
        </div>
      ) : null}

      {active ? (
        <WorkerChatWindow
          agent={active}
          onClose={() => setActive(null)}
        />
      ) : null}
    </>
  );
}
