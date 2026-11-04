import Link from "next/link";
import type { Metadata } from "next";
import { PageDecor } from "@/components/page-decor";

export const metadata: Metadata = {
  title: "会员",
  description: "科研通校园试用与永久会员说明",
};

export default function PricingPage() {
  return (
    <main className="page">
      <PageDecor variant="sparse" />
      <h1 className="page-title">试用与会员</h1>
      <p className="page-lead">
        面向高校师生。校园邮箱验证后免费试用 7 天；之后开通 19.9 元永久会员（本期由站长人工开通，暂不在线支付）。
      </p>
      <div className="hub-grid">
        <article className="hub-tile">
          <span className="tag">Trial</span>
          <h3>7 天试用</h3>
          <p>文献关系网、工具目录、合规社区发帖。最多 2 台设备同时登录。</p>
        </article>
        <article className="hub-tile">
          <span className="tag">Lifetime · ¥19.9</span>
          <h3>永久会员</h3>
          <p>试用到期后保持全部能力。付款后由管理端标记开通，无需再付年费。</p>
        </article>
      </div>
      <section className="section" style={{ marginTop: "1.25rem" }}>
        <h2>设备说明</h2>
        <p className="section-lead">
          网站无法读取电脑网卡 MAC。我们用浏览器生成的设备号限制同一账号同时 2
          台设备，减少账号共享。换电脑时可选择注销最旧设备。
        </p>
        <div className="actions">
          <Link className="btn btn-primary" href="/register">
            校园邮箱注册
          </Link>
          <Link className="btn btn-secondary" href="/login">
            登录
          </Link>
        </div>
      </section>
    </main>
  );
}
