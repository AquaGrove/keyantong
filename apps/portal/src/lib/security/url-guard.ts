/** External link policy for community tool shares. */

const BLOCKED_HOST_SUBSTR = [
  "sci-hub",
  "scihub",
  "libgen",
  "librarygenesis",
  "z-lib",
  "zlib.",
  "annas-archive",
  "anna-archive",
  "booksc.org",
  "bookfi",
];

export type UrlCheck =
  | { ok: true; href: string }
  | { ok: false; error: string };

export function validatePublicHttpUrl(raw: string, opts?: { maxLen?: number }): UrlCheck {
  const maxLen = opts?.maxLen ?? 2000;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: false, error: "链接不能为空" };
  if (trimmed.length > maxLen) return { ok: false, error: "链接过长" };
  if (/[\s<>"']/.test(trimmed)) return { ok: false, error: "链接含非法字符" };

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, error: "链接格式无效" };
  }

  const proto = u.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") {
    return { ok: false, error: "仅允许 http(s) 外链" };
  }
  if (u.username || u.password) {
    return { ok: false, error: "链接不可含用户名密码" };
  }
  const host = (u.hostname || "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) {
    return { ok: false, error: "不允许本机或内网主机名" };
  }
  // block obvious IP literals for SSRF-ish shares (MVP soft rule)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return { ok: false, error: "请使用域名外链，勿贴内网/裸 IP" };
  }
  const hay = `${host}${u.pathname}`.toLowerCase();
  if (BLOCKED_HOST_SUBSTR.some((b) => hay.includes(b))) {
    return { ok: false, error: "该域名在合规黑名单中（疑似盗版文献站）" };
  }
  return { ok: true, href: u.toString() };
}
