"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocaleToggle } from "@/components/locale-toggle";
import { useI18n } from "@/lib/i18n";

/** Keep account controls and a reliable route home available on every page. */
export function SiteHeaderActions({
  loggedIn,
}: {
  loggedIn: boolean;
  communityHref: string;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <header className="site-header">
      <Link className="logo" href="/" aria-label={t("nav.home")}>
        <span className="logo-emblem" aria-hidden="true">
          研
        </span>
        <span className="logo-text">
          {t("brand.name")}
          <small>KEYANTONG / OPEN SCIENCE</small>
        </span>
      </Link>
      {
        <nav className="module-nav" aria-label={t("nav.more")}>
          {[
            ["literature", "nav.literature"],
            ["tools", "nav.tools"],
            ["genomes", "nav.genomes"],
            ["analysis", "nav.analysis"],
            ["community", "nav.community"],
          ].map(([path, key]) => (
            <Link
              key={path}
              href={`/${path}`}
              aria-current={
                pathname.startsWith(`/${path}`) ? "page" : undefined
              }
            >
              {t(key)}
            </Link>
          ))}
        </nav>
      }
      <nav className="nav" aria-label="primary">
        <LocaleToggle />
        {loggedIn ? (
          <>
            <Link className="nav-link nav-bell" href="/notifications">
              {t("nav.notifications")}
            </Link>
            <Link className="nav-cta" href="/account">
              {t("nav.account")}
            </Link>
          </>
        ) : (
          <>
            <Link className="btn btn-secondary nav-register" href="/register">
              {t("nav.register")}
            </Link>
            <Link className="nav-cta" href="/login">
              {t("nav.login")}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
