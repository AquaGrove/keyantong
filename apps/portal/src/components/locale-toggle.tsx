"use client";

import { useI18n } from "@/lib/i18n";

export function LocaleToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="locale-toggle" role="group" aria-label={t("lang.toggle")}>
      <button
        type="button"
        className={locale === "zh" ? "locale-btn is-on" : "locale-btn"}
        onClick={() => setLocale("zh")}
        aria-pressed={locale === "zh"}
      >
        {t("lang.zh")}
      </button>
      <button
        type="button"
        className={locale === "en" ? "locale-btn is-on" : "locale-btn"}
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
      >
        {t("lang.en")}
      </button>
    </div>
  );
}
