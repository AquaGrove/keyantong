"use client";

import { FormEvent, KeyboardEvent, useRef, useState, type RefObject } from "react";
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

function isEnterConfirm(e: KeyboardEvent) {
  return e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing;
}

export default function RegisterPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const verifyRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "verify" | "done">("form");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);

  function submitOnEnter(
    e: KeyboardEvent<HTMLInputElement>,
    ref: RefObject<HTMLFormElement | null>,
  ) {
    if (!isEnterConfirm(e)) return;
    e.preventDefault();
    ref.current?.requestSubmit();
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setErr(String(data.error || `注册失败（HTTP ${res.status}）`));
        return;
      }
      setMsg(String(data.message || "请查收验证码"));
      if (typeof data.devCode === "string" && data.devCode) {
        setDevCode(data.devCode);
        setCode(data.devCode);
      }
      setStep("verify");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络异常，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        setErr(String(data.error || `验证失败（HTTP ${res.status}）`));
        return;
      }
      setMsg(String(data.message || "验证成功"));
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          deviceId: getOrCreateDeviceId(),
          deviceLabel: navigator.userAgent.slice(0, 80),
        }),
      });
      const loginData = await readJsonSafe(loginRes);
      if (loginRes.ok) {
        router.push("/account");
        router.refresh();
        return;
      }
      setErr(String(loginData.error || "验证成功，但自动登录失败，请手动登录"));
      setStep("done");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "网络异常，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">校园邮箱注册</h1>
      <p className="page-lead">
        仅限师生校园邮箱（.edu.cn / .edu）。验证通过后试用 7 天；之后由站长开通 19.9
        永久会员。
      </p>

      {err ? (
        <p className="rules-banner" role="alert">
          {err}
        </p>
      ) : null}
      {msg ? <p className="section-lead">{msg}</p> : null}

      {step === "form" ? (
        <form className="help-form" ref={formRef} onSubmit={onRegister}>
          <label>
            校园邮箱
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@mail.hzau.edu.cn"
              disabled={busy}
              autoComplete="email"
              onKeyDown={(e) => submitOnEnter(e, formRef)}
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
              disabled={busy}
              autoComplete="new-password"
              onKeyDown={(e) => submitOnEnter(e, formRef)}
            />
          </label>
          <button className="enter-confirm-btn" type="submit" disabled={busy}>
            {busy ? "正在提交…" : "按 Enter 发送验证码"}
          </button>
        </form>
      ) : null}

      {step === "verify" ? (
        <form className="help-form" ref={verifyRef} onSubmit={onVerify}>
          {devCode ? (
            <p className="form-note">
              当前未配置 SMTP 发信，验证码已显示：<code className="mono">{devCode}</code>
            </p>
          ) : null}
          <label>
            邮箱验证码
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              inputMode="numeric"
              disabled={busy}
              autoComplete="one-time-code"
              onKeyDown={(e) => submitOnEnter(e, verifyRef)}
            />
          </label>
          <button className="enter-confirm-btn" type="submit" disabled={busy}>
            {busy ? "正在验证…" : "按 Enter 完成验证并开始试用"}
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
