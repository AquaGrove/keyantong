const CAMPUS_RE = /@.+\.(edu\.cn|edu)$/i;

export function isCampusEmail(email: string): boolean {
  return CAMPUS_RE.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
