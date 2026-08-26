import Link from "next/link";
import { getCommunityHref } from "@/lib/site";

const links = [
  { href: "/", label: "首页" },
  { href: "/community", label: "社区" },
  { href: "/tools", label: "工具" },
  { href: "/about", label: "关于" },
];

export function SiteHeader() {
  const community = getCommunityHref();

  return (
    <header className="site-header">
      <Link href="/" className="logo" aria-label="科研通首页">
        <span className="logo-mark" aria-hidden />
        <span className="logo-text">科研通</span>
      </Link>
      <nav className="nav" aria-label="主导航">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="nav-link">
            {l.label}
          </Link>
        ))}
        <a className="nav-cta" href={community}>
          进入社区
        </a>
      </nav>
    </header>
  );
}
