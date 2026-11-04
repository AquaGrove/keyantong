import Link from "next/link";
import { getCommunityHref } from "@/lib/site";
import { currentUser } from "@/lib/user-session";

const links = [
  { href: "/", label: "首页" },
  { href: "/papers", label: "文献网" },
  { href: "/community", label: "社区" },
  { href: "/tools", label: "工具" },
  { href: "/tools/ai", label: "AI" },
  { href: "/pricing", label: "定价" },
  { href: "/about", label: "关于" },
];

export async function SiteHeader() {
  const community = getCommunityHref();
  const user = await currentUser();

  return (
    <header className="site-header">
      <Link href="/" className="logo" aria-label="科研通首页">
        <span className="logo-mark" aria-hidden />
        <span className="logo-text">科研通</span>
      </Link>
      <nav className="nav" aria-label="主导航">
        {links.map((l) => (
          <Link key={l.href} href={l.href === "/community" ? community : l.href} className="nav-link">
            {l.label}
          </Link>
        ))}
        {user ? (
          <Link className="nav-cta" href="/account">
            账号
          </Link>
        ) : (
          <Link className="nav-cta" href="/login">
            登录
          </Link>
        )}
      </nav>
    </header>
  );
}
