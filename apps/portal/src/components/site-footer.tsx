"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GITHUB_CONTRIBUTING_URL,
  GITHUB_DOCS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_URL,
} from "@/lib/site";
import { useI18n } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useI18n();
  const pathname = usePathname();
  if (pathname === "/") return null;

  return (
    <footer className="site-footer">
      <div className="footer-row">
        <p className="footer-brand">{t("brand.name")} KeyanTong</p>
        <p className="footer-note">{t("brand.tagline")}</p>
      </div>
      <div className="footer-links">
        <Link href="/papers">{t("nav.papers")}</Link>
        <Link href="/community">{t("nav.community")}</Link>
        <Link href="/tools">{t("nav.tools")}</Link>
        <Link href="/pricing">{t("nav.pricing")}</Link>
        <Link href="/about">{t("nav.about")}</Link>
        <Link href="/account">{t("nav.account")}</Link>
        <Link href="/notifications">{t("nav.notifications")}</Link>
        <a href={GITHUB_ISSUES_URL}>{t("footer.contact")}</a>
        <a href={GITHUB_URL}>GitHub</a>
        <a href={GITHUB_DOCS_URL}>{t("footer.docs")}</a>
        <a href={GITHUB_CONTRIBUTING_URL}>{t("footer.contribute")}</a>
        <a href="https://www.apache.org/licenses/LICENSE-2.0">{t("footer.license")}</a>
      </div>
    </footer>
  );
}
