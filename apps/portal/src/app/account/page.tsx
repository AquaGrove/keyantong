import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountDevices } from "@/components/account-devices";
import { membershipStatus, publicUser } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const view = publicUser(user);
  const live = membershipStatus(user);

  return (
    <main className="page">
      <h1 className="page-title">我的账户</h1>
      <p className="page-lead">{view.email}</p>

      <div className="stats">
        <div className="stat">
          <span className="label">会员</span>
          <span className="value" style={{ fontSize: "1.2rem" }}>
            {live === "lifetime" ? "永久" : live === "trial" ? "试用中" : "已到期"}
          </span>
        </div>
        <div className="stat">
          <span className="label">试用截止</span>
          <span className="value" style={{ fontSize: "1rem" }}>
            {view.trialEndsAt
              ? new Date(view.trialEndsAt).toLocaleString("zh-CN")
              : "—"}
          </span>
        </div>
        <div className="stat">
          <span className="label">校园认证</span>
          <span className="value" style={{ fontSize: "1.2rem" }}>
            {view.campusVerified ? "已通过" : "未通过"}
          </span>
        </div>
        <div className="stat">
          <span className="label">设备</span>
          <span className="value">{view.devices.length} / 2</span>
        </div>
      </div>

      {live === "expired" ? (
        <div className="rules-banner">
          试用已结束。永久会员 19.9 元，由站长在管理端开通。开通前文献图扩图与发帖不可用。
          <Link href="/pricing"> 查看说明</Link>
        </div>
      ) : null}

      <section className="section">
        <h2>已登录设备</h2>
        <p className="section-lead">最多 2 台。注销后该浏览器需重新登录。</p>
        <AccountDevices devices={view.devices} />
      </section>

      <form action="/api/auth/logout" method="post" style={{ marginTop: "1.25rem" }}>
        <button className="btn btn-secondary" type="submit">
          退出登录
        </button>
      </form>
    </main>
  );
}
