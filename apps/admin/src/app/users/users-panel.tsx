"use client";

import { useState } from "react";

type Device = { id: string; label: string; lastSeen: string };

export type AdminUser = {
  id: string;
  email: string;
  liveMembership: string;
  pendingVerify?: boolean;
  trialEndsAt?: string | null;
  createdAt?: string;
  lastCode?: string;
  devices?: Device[];
};

export function UsersPanel({ initial }: { initial: AdminUser[] }) {
  const [users, setUsers] = useState(initial);
  const [msg, setMsg] = useState("");

  async function refresh() {
    const res = await fetch("/api/users");
    const data = await res.json();
    if (res.ok && Array.isArray(data.users)) setUsers(data.users);
  }

  async function act(userId: string, action: string, deviceId?: string) {
    setMsg("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, action, deviceId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "操作失败");
      return;
    }
    await refresh();
  }

  if (users.length === 0) {
    return <p className="mono">还没有注册用户，或门户内部接口不可达。</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      {msg ? <p className="lead">{msg}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>邮箱</th>
            <th>状态</th>
            <th>试用截止</th>
            <th>设备</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>
                <div>{u.email}</div>
                {u.pendingVerify && u.lastCode ? (
                  <div className="mono">待验证码 {u.lastCode}</div>
                ) : null}
              </td>
              <td>{u.liveMembership}</td>
              <td className="mono">
                {u.trialEndsAt ? new Date(u.trialEndsAt).toLocaleString("zh-CN") : "—"}
              </td>
              <td>
                {(u.devices || []).length === 0 ? (
                  <span className="mono">无</span>
                ) : (
                  (u.devices || []).map((d) => (
                    <div key={d.id} style={{ marginBottom: "0.35rem" }}>
                      <span className="mono">{d.label || d.id.slice(0, 8)}</span>{" "}
                      <button type="button" className="ghost-btn" style={{ width: "auto" }} onClick={() => act(u.id, "revoke_device", d.id)}>
                        踢出
                      </button>
                    </div>
                  ))
                )}
              </td>
              <td>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  <button type="button" className="ghost-btn" style={{ width: "auto" }} onClick={() => act(u.id, "grant_lifetime")}>
                    发永久
                  </button>
                  <button type="button" className="ghost-btn" style={{ width: "auto" }} onClick={() => act(u.id, "revoke_lifetime")}>
                    收回
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
