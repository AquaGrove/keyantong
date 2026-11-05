// Reserved internal namespace. These identifiers are never treated as email addresses.
const suffix = "@account.keyantong.invalid";

export function usernameEmail(username: string): string | null {
  const normalized = username.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,29}$/.test(normalized) ? normalized + suffix : null;
}

export function isUsernameAccount(email: string): boolean {
  return email.endsWith(suffix) && usernameEmail(email.slice(0, -suffix.length)) === email;
}
