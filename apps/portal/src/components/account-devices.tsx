"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Device = { id: string; label: string; lastSeen: string };

export function AccountDevices({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [err, setErr] = useState("");

  async function revoke(deviceId: string) {
    setErr("");
    const res = await fetch("/api/me/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "无法注销设备");
      return;
    }
    router.refresh();
  }

  if (devices.length === 0) {
    return <p className="mono">当前没有有效设备记录。</p>;
  }

  return (
    <>
      {err ? <p className="rules-banner">{err}</p> : null}
      <ul className="pulse-list">
        {devices.map((d) => (
          <li key={d.id}>
            <span className="mono">{d.id.slice(0, 8)}</span>
            <span>{d.label}</span>
            <span>
              <span className="mono">{new Date(d.lastSeen).toLocaleString("zh-CN")}</span>{" "}
              <button type="button" className="linkish" onClick={() => revoke(d.id)}>
                注销
              </button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
