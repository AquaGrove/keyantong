"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocaleToggle } from "@/components/locale-toggle";
import { useI18n } from "@/lib/i18n";

const MODULE_LINKS = [
  { href: "/papers", key: "nav.papers" },
  { href: "/community", key: "nav.community" },
  { href: "/tools", key: "nav.tools" },
  { href: "/tools/ai", key: "nav.ai" },
  { href: "/pricing", key: "nav.pricing" },
  { href: "/about", key: "nav.about" },
] as const;

export function SiteHeaderActions({
  loggedIn,
  communityHref,
}: {
  loggedIn: boolean;
  communityHref: string;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const isHome = pathname === "/";

  if (isHome) {
    return (
      <header className="site-header site-header-home">
        <nav className="nav nav-home-center" aria-label="primary">
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

  return (
    <header className="site-header">
      <Link href="/" className="logo" aria-label="KeyanTong home">
        <span className="logo-mark" aria-hidden />
        <span className="logo-text">科研通</span>
      </Link>
      <nav className="nav" aria-label="primary">
        <Link href="/" className="nav-link">
          {t("nav.home")}
        </Link>
        {MODULE_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href === "/community" ? communityHref : l.href}
            className="nav-link"
          >
            {t(l.key)}
          </Link>
        ))}
        <LocaleToggle />
        {loggedIn ? (
          <Link className="nav-link nav-bell" href="/notifications">
            {t("nav.notifications")}
          </Link>
        ) : null}
        {loggedIn ? (
          <Link className="nav-cta" href="/account">
            {t("nav.account")}
          </Link>
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
