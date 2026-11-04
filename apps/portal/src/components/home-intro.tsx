"use client";

import { useI18n } from "@/lib/i18n";

export function HomeIntro() {
  const { t } = useI18n();
  return (
    <header className="home-intro">
      <p className="kicker">{t("home.kicker")}</p>
      <h1 className="home-title">{t("home.title")}</h1>
      <p className="home-lead">{t("home.lead")}</p>
    </header>
  );
}
