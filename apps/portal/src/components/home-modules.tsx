"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
export function HomeModules() {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const modules = [
    {
      n: "01",
      icon: "◎",
      title: zh ? "文献与互助" : "Literature",
      subtitle: zh
        ? "探索文献网络，寻找获取路径"
        : "Explore papers. Find legal access.",
      href: "/literature",
    },
    {
      n: "02",
      icon: "⌘",
      title: zh ? "科研工具" : "Research tools",
      subtitle: zh ? "插件、软件、在线网站" : "Plugins, software and websites",
      href: "/tools",
    },
    {
      n: "03",
      icon: "≋",
      title: zh ? "组学分析" : "Omics analysis",
      subtitle: "RNA-seq / BSA-seq / GWAS / Single-cell",
      href: "/analysis",
    },
    {
      n: "04",
      icon: "↗",
      title: zh ? "科研论坛" : "Community",
      subtitle: zh
        ? "日常、心得、瓶颈与响应"
        : "Notes, questions and shared experience",
      href: "/community",
    },
    { n: "05", icon: "♧", title: zh ? "植物基因组" : "Plant genomes", subtitle: zh ? "物种、参考基因组与官方资源" : "Species, assemblies and official resources", href: "/genomes" },
  ];
  return (
    <nav
      className="home-modules"
      aria-label={zh ? "科研通模块" : "Research modules"}
    >
      {modules.map((m) => (
        <Link key={m.n} href={m.href}>
          <span className="module-symbol" aria-hidden="true">
            {m.icon}
          </span>
          <span className="module-index">{m.n}</span>
          <strong>{m.title}</strong>
          <span>{m.subtitle}</span>
        </Link>
      ))}
    </nav>
  );
}
