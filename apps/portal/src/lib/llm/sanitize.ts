import { sanitizeMultiline, sanitizePlainText } from "@/lib/security/sanitize";

const SECRETish =
  /\b(sk-[a-zA-Z0-9]{10,}|AKIA[0-9A-Z]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;

const PHONE_CN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ID18 = /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g;

export function redactForModel(text: string): string {
  let s = sanitizeMultiline(text, 8000);
  s = s.replace(SECRETish, "[REDACTED_SECRET]");
  s = s.replace(PHONE_CN, "[REDACTED_PHONE]");
  s = s.replace(ID18, "[REDACTED_ID]");
  return s;
}

export function sanitizeModelOutput(text: string, maxLen = 12000): string {
  let s = sanitizeMultiline(text, maxLen);
  if (SECRETish.test(s)) {
    s = s.replace(SECRETish, "[REDACTED]");
  }
  // never return raw angle-bracket HTML
  s = s.replace(/[<>]/g, "");
  return s;
}

export function sanitizeFact(f: unknown): string | null {
  if (typeof f !== "string") return null;
  const t = sanitizePlainText(f, 500);
  if (!t) return null;
  return redactForModel(t).slice(0, 500);
}

export function containsSecretPattern(text: string): boolean {
  return SECRETish.test(text);
}
