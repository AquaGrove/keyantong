"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOrCreateDeviceId } from "@/lib/device-client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [devCode, setDevCode] = useState("");

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "注册失败");
      return;
    }
    setMsg(data.message);
    if (data.devCode) setDevCode(data.devCode);
    setStep("verify");
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
    setMsg(data.message);
    const loginRes = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        deviceId: getOrCreateDeviceId(),
        deviceLabel: navigator.userAgent.slice(0, 80),
      }),
    });
    if (loginRes.ok) {
      router.push("/account");
      router.refresh();
      return;
    }
    setStep("done");
  }

  return (
    <main className="page">
      <h1 className="page-title">校园邮箱注册</h1>
      <p className="page-lead">
        仅限师生校园邮箱（.edu.cn / .edu）。验证通过后试用 7 天；之后由站长开通 19.9
        永久会员。
      </p>

      {err ? <p className="rules-banner">{err}</p> : null}
      {msg ? <p className="section-lead">{msg}</p> : null}

      {step === "form" ? (
        <form className="help-form" onSubmit={onRegister}>
          <label>
            校园邮箱
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@mail.hzau.edu.cn"
            />
          </label>
          <label>
            密码（至少 8 位）
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn btn-primary" type="submit">
            发送验证码
          </button>
        </form>
      ) : null}

      {step === "verify" ? (
        <form className="help-form" onSubmit={onVerify}>
          {devCode ? (
            <p className="form-note">
              开发回显验证码：<code className="mono">{devCode}</code>
            </p>
          ) : null}
          <label>
            邮箱验证码
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              inputMode="numeric"
            />
          </label>
          <button className="btn btn-primary" type="submit">
            完成验证并开始试用
          </button>
        </form>
      ) : null}

      {step === "done" ? (
        <div className="actions">
          <Link className="btn btn-primary" href="/login">
            去登录
          </Link>
          <Link className="btn btn-secondary" href="/papers">
            文献关系网
          </Link>
        </div>
      ) : null}

      <p className="form-note" style={{ marginTop: "1.25rem" }}>
        已有账号？<Link href="/login">登录</Link>
      </p>
    </main>
  );
}
