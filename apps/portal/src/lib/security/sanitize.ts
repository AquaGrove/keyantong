/** Plain-text UGC hygiene: never treat user HTML as trusted. */

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strip tags / angle brackets and normalize whitespace for storage & display. */
export function sanitizePlainText(input: string, maxLen: number): string {
  let s = String(input ?? "");
  s = s.replace(CONTROL, "");
  // neutralize HTML / script-looking markup without interpreting it
  s = s.replace(/[<>]/g, "");
  s = s.replace(/[\u2028\u2029]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function sanitizeMultiline(input: string, maxLen: number): string {
  let s = String(input ?? "");
  s = s.replace(CONTROL, "");
  s = s.replace(/[<>]/g, "");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/[^\S\n]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function maskEmail(email: string): string {
  const e = (email || "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at <= 0) return "匿名用户";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const shown = local.slice(0, 1) || "*";
  return `${shown}***@${domain}`;
}

/** Soft check: reject copy that steers people to pirate PDFs. */
export function looksLikePiracySolicitation(text: string): boolean {
  const t = text.toLowerCase();
  const needles = [
    "sci-hub",
    "scihub",
    "libgen",
    "library genesis",
    "z-library",
    "zlib",
    "安娜的档案",
    "annas-archive",
    "anna's archive",
    "盗版pdf",
    "破解版pdf",
    "求pdf全文",
    "求全文pdf",
    "传pdf",
    "互传pdf",
    "百度网盘.*付费全文",
  ];
  return needles.some((n) => (n.includes(".*") ? new RegExp(n, "i").test(t) : t.includes(n)));
}
