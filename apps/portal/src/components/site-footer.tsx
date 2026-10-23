import Link from "next/link";
import {
  GITHUB_CONTRIBUTING_URL,
  GITHUB_DOCS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_URL,
} from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-row">
        <p className="footer-brand">科研通 KeyanTong</p>
        <p className="footer-note">开源共享 · 合规互助 · Apache-2.0</p>
      </div>
      <div className="footer-links">
        <Link href="/papers">文献网</Link>
        <Link href="/community">社区</Link>
        <Link href="/tools">工具</Link>
        <Link href="/pricing">定价</Link>
        <Link href="/about">关于</Link>
        <Link href="/account">账号</Link>
        <a href={GITHUB_ISSUES_URL}>联系我们</a>
        <a href={GITHUB_URL}>GitHub</a>
        <a href={GITHUB_DOCS_URL}>文档</a>
        <a href={GITHUB_CONTRIBUTING_URL}>贡献指南</a>
        <a href="https://www.apache.org/licenses/LICENSE-2.0">许可证</a>
      </div>
    </footer>
  );
}
