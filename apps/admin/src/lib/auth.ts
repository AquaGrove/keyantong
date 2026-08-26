export const ADMIN_COOKIE = "kt_admin_session";

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toHex(sig);
}

export function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "dev-only-change-me"
  );
}

export async function createSessionToken(ttlMs = 7 * 24 * 60 * 60 * 1000): Promise<string> {
  const exp = Date.now() + ttlMs;
  const payload = `admin.${exp}`;
  const sig = await hmacHex(getSessionSecret(), payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [role, expStr, sig] = parts;
  if (role !== "admin") return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const payload = `${role}.${expStr}`;
  const expected = await hmacHex(getSessionSecret(), payload);
  if (expected.length !== sig.length) return false;
  let ok = true;
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== sig[i]) ok = false;
  }
  return ok;
}

export function getAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}
