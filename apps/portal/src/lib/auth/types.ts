export type Membership = "trial" | "lifetime" | "expired";
export type Device = {
  id: string;
  label: string;
  lastSeen: string;
  revoked: boolean;
};
export type User = {
  id: string;
  email: string;
  passwordHash: string;
  campusVerifiedAt: string | null;
  trialEndsAt: string | null;
  membership: Membership;
  lifetimeGrantedAt: string | null;
  createdAt: string;
  devices: Device[];
  role?: "member" | "moderator" | "admin";
};
export type EmailCode = {
  email: string;
  code: string;
  expiresAt: string;
  purpose: "register" | "login";
};
export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}
