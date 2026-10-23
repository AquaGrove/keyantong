import { AdminShell } from "@/components/admin-shell";
import { getPortalBaseUrl, portalFetch } from "@/lib/portal-internal";
import { UsersPanel, type AdminUser } from "./users-panel";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  let users: AdminUser[] = [];
  let error = "";
  try {
    const res = await portalFetch("/api/internal/users");
    const data = (await res.json()) as { users?: AdminUser[]; error?: string };
    if (!res.ok) error = data.error || `门户返回 ${res.status}`;
    else users = data.users || [];
  } catch (err) {
    error = err instanceof Error ? err.message : "无法连接门户内部接口";
  }

  return (
    <AdminShell>
      <h1>用户</h1>
      <p className="lead">
        在门户 JSON 用户库上发放永久会员、踢设备。支付仍为线下；本页只改会员状态。门户：
        <span className="mono"> {getPortalBaseUrl()}</span>
      </p>
      {error ? <p className="lead">{error}</p> : <UsersPanel initial={users} />}
    </AdminShell>
  );
}
