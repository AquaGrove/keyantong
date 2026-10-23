"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/device-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [needReplace, setNeedReplace] = useState(false);
  const [needVerify, setNeedVerify] = useState(false);
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  async function login(replaceOldest: boolean) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        deviceId,
        deviceLabel: navigator.userAgent.slice(0, 80),
        replaceOldest,
      }),
    });
    const data = await res.json();
    if (res.status === 403 && data.needVerify) {
      setNeedVerify(true);
      setErr(data.error || "请先完成校园邮箱验证");
      return false;
    }
    if (res.status === 409 && data.code === "DEVICE_LIMIT") {
      setNeedReplace(true);
      setErr(data.error);
      return false;
    }
    if (!res.ok) {
      setErr(data.error || "登录失败");
      return false;
    }
    if (data.deviceId) localStorage.setItem("kt_device_id", data.deviceId);
    router.push("/account");
    router.refresh();
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    await login(needReplace);
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "验证失败");
      return;
    }
    setNeedVerify(false);
    await login(needReplace);
  }

  return (
    <main className="page">
      <h1 className="page-title">登录</h1>
      <p className="page-lead">同一账号最多同时 2 台设备（用浏览器设备号识别，不是网卡 MAC）。</p>
      {err ? <p className="rules-banner">{err}</p> : null}

      {needVerify ? (
        <form className="help-form" onSubmit={onVerify}>
          <label>
            邮箱验证码
            <input value={code} onChange={(e) => setCode(e.target.value)} required inputMode="numeric" />
          </label>
          <button className="btn btn-primary" type="submit">
            验证并登录
          </button>
        </form>
      ) : (
        <form className="help-form" onSubmit={onSubmit}>
          <label>
            校园邮箱
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setNeedReplace(false);
              }}
            />
          </label>
          <label>
            密码
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit">
            {needReplace ? "注销最旧设备并登录" : "登录"}
          </button>
        </form>
      )}
      <p className="form-note" style={{ marginTop: "1.25rem" }}>
        没有账号？<Link href="/register">校园邮箱注册</Link>
        {" · "}
        <Link href="/pricing">会员说明</Link>
      </p>
    </main>
  );
}
