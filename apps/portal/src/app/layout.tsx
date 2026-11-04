import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { I18nProvider } from "@/lib/i18n/provider";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/dictionary";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "科研通 KeyanTong",
    template: "%s · 科研通",
  },
  description:
    "开源共享的科研互助平台：对话调度入口、社区问答、工具沉淀与可复现协作。合规优先，人人可贡献。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jar = await cookies();
  const raw = jar.get(LOCALE_COOKIE)?.value;
  const initialLocale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return (
    <html lang={initialLocale === "zh" ? "zh-CN" : "en"}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Outfit:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <I18nProvider initialLocale={initialLocale}>
          <div className="grain" aria-hidden />
          <SiteHeader />
          {children}
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
