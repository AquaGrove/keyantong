"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/device-client";

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: `服务器返回了无法解析的响应（HTTP ${res.status}）` };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [needReplace, setNeedReplace] = useState(false);
  const [needVerify, setNeedVerify] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [busy, setBusy] = useState(false);

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
    const data = await readJsonSafe(res);
    if (res.status === 403 && data.needVerify) {
      setNeedVerify(true);
      setErr(String(data.error || "请先完成校园邮箱验证"));
      return false;
    }
    if (res.status === 409 && data.code === "DEVICE_LIMIT") {
      setNeedReplace(true);
      setErr(String(data.error || "设备数量已达上限"));
      return false;
    }
    if (!res.ok) {
      setErr(String(data.error || `登录失败（HTTP ${res.status}）`));
      return false;
    }
    if (typeof data.deviceId === "string" && data.deviceId) {
      localStorage.setItem("kt_device_id", data.deviceId);
    }
    router.push("/account");
    router.refresh();
    return true;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(needReplace);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络异常，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setErr(String(data.error || `验证失败（HTTP ${res.status}）`));
        return;
      }
      setNeedVerify(false);
      await login(needReplace);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络异常，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">登录</h1>
      <p className="page-lead">同一账号最多同时 2 台设备（用浏览器设备号识别，不是网卡 MAC）。</p>
      {err ? (
        <p className="rules-banner" role="alert">
          {err}
        </p>
      ) : null}

      {needVerify ? (
        <form className="help-form" onSubmit={onVerify}>
          <label>
            邮箱验证码
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              inputMode="numeric"
              disabled={busy}
              autoComplete="one-time-code"
            />
          </label>
          <button className="enter-submit-hidden" type="submit" disabled={busy} aria-hidden={false}>
            {busy ? "验证中…" : "验证并登录"}
          </button>
          <p className="enter-hint mono" aria-live="polite">
            {busy ? "正在验证…" : "按 Enter 确认验证并登录"}
          </p>
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
              disabled={busy}
              autoComplete="email"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoComplete="current-password"
            />
          </label>
          <button className="enter-submit-hidden" type="submit" disabled={busy}>
            {busy ? "登录中…" : needReplace ? "注销最旧设备并登录" : "登录"}
          </button>
          <p className="enter-hint mono" aria-live="polite">
            {busy
              ? "正在登录…"
              : needReplace
                ? "按 Enter：注销最旧设备并登录"
                : "按 Enter 登录"}
          </p>
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
