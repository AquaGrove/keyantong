"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LocaleToggle } from "@/components/locale-toggle";
import { useI18n } from "@/lib/i18n";

/** Traditional site chrome only on the home page. Inner pages use AskWho. */
export function SiteHeaderActions({
  loggedIn,
}: {
  loggedIn: boolean;
  communityHref: string;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  if (pathname !== "/") return null;

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
