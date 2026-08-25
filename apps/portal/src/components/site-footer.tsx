import Link from "next/link";
import {
  GITHUB_CONTRIBUTING_URL,
  GITHUB_DOCS_URL,
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
        <a href={GITHUB_URL}>GitHub</a>
        <a href={GITHUB_DOCS_URL}>文档</a>
        <a href={GITHUB_CONTRIBUTING_URL}>贡献指南</a>
        <Link href="/monitor">监测台</Link>
        <a href="https://www.apache.org/licenses/LICENSE-2.0">许可证</a>
      </div>
    </footer>
  );
}
