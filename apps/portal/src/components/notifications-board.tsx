"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { NotificationItem, NotifKind } from "@/lib/notifications/store";

const TABS: { id: NotifKind | "all"; labelKey: string }[] = [
  { id: "results", labelKey: "notif.tab.results" },
  { id: "system", labelKey: "notif.tab.system" },
  { id: "hot", labelKey: "notif.tab.hot" },
];

export function NotificationsBoard({
  initialItems,
  loggedIn,
}: {
  initialItems: NotificationItem[];
  loggedIn: boolean;
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<NotifKind>("results");
  const [items, setItems] = useState(initialItems);

  const filtered = useMemo(() => items.filter((i) => i.kind === tab), [items, tab]);

  async function markRead(id: string) {
    if (!loggedIn) return;
    const res = await fetch("/api/notifications", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", id }),
    });
    if (res.ok) {
      setItems((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
    }
  }

  return (
    <section className="section notif-board">
      <h2>{t("notif.title")}</h2>
      <p className="section-lead">{t("notif.lead")}</p>
      <div className="ai-scene-row" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={tab === x.id ? "chip chip-on" : "chip"}
            onClick={() => setTab(x.id as NotifKind)}
          >
            {t(x.labelKey)}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="mono" style={{ marginTop: "1rem" }}>
          {t("notif.empty")}
        </p>
      ) : (
        <ul className="notif-list">
          {filtered.map((n) => {
            const title = locale === "en" && n.titleEn ? n.titleEn : n.title;
            const body = locale === "en" && n.bodyEn ? n.bodyEn : n.body;
            return (
              <li key={n.id} className={n.read ? "notif-item is-read" : "notif-item"}>
                <div className="notif-item-main">
                  <strong>{title}</strong>
                  <p>{body}</p>
                  <span className="mono">
                    {new Date(n.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
                  </span>
                </div>
                <div className="notif-item-actions">
                  {n.href ? (
                    <Link className="btn btn-secondary" href={n.href}>
                      {locale === "zh" ? "查看" : "Open"}
                    </Link>
                  ) : null}
                  {loggedIn && !n.read ? (
                    <button type="button" className="btn btn-secondary" onClick={() => void markRead(n.id)}>
                      {t("notif.markRead")}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
