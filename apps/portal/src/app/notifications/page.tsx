import type { Metadata } from "next";
import Link from "next/link";
import { NotificationsBoard } from "@/components/notifications-board";
import { currentUser } from "@/lib/user-session";
import { listNotifications } from "@/lib/notifications/store";

export const metadata: Metadata = {
  title: "通知中心",
  description: "分析结果、站内通知与最新热点",
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await currentUser();
  const items = await listNotifications(user?.id);

  return (
    <main className="page">
      <p className="page-crumb">
        <Link href="/">← Home</Link>
      </p>
      <div className="module-hero">
        <p className="page-kicker">Inbox</p>
        <h1 className="page-title">通知中心 / Notifications</h1>
        <p className="page-lead">
          分析结果、站内通知、最新热点分模块展示。登录后可标记已读。
        </p>
      </div>
      <NotificationsBoard initialItems={items} loggedIn={Boolean(user)} />
    </main>
  );
}
