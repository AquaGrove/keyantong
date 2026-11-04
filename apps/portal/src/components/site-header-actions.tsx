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

  return (
    <nav className="nav" aria-label="primary">
      {!isHome ? (
        <>
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
        </>
      ) : (
        <span className="nav-home-hint" aria-hidden>
          {t("home.intro.badge")}
        </span>
      )}
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
        <Link className="nav-cta" href="/login">
          {t("nav.login")}
        </Link>
      )}
    </nav>
  );
}
