"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "总览" },
  { href: "/users", label: "用户" },
  { href: "/github", label: "GitHub" },
  { href: "/services", label: "服务健康" },
  { href: "/content", label: "内容治理" },
  { href: "/resources", label: "资源审核" },
  { href: "/settings", label: "设置" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          科研通管理端
          <span>ADMIN · :3001 · private</span>
        </div>
        <nav className="side-nav" aria-label="管理导航">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link key={l.href} href={l.href} className={active ? "active" : undefined}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="side-foot">
          <a className="ghost-btn" href={process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000"} style={{ display: "block", textDecoration: "none" }}>
            打开客户端
          </a>
          <form action="/api/logout" method="post">
            <button type="submit">退出登录</button>
          </form>
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
