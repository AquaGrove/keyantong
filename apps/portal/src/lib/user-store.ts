import * as legacy from "./auth/legacy";
import * as pg from "./auth/postgres";
import { authUsesPostgres, assertAuthWritable } from "./db/pool";
import { AuthError, type User, type EmailCode } from "./auth/types";
export type { User, Device, Membership, EmailCode } from "./auth/types";
export {
  membershipStatus,
  isEntitled,
  MAX_DEVICES,
  activeDevices,
  publicUser,
} from "./auth/legacy";
export async function listUsers() {
  return authUsesPostgres() ? pg.allUsers() : legacy.listUsers();
}
export async function getUserByEmail(email: string) {
  return authUsesPostgres()
    ? pg.findUser("email", email)
    : legacy.getUserByEmail(email);
}
export async function getUserById(id: string) {
  return authUsesPostgres() ? pg.findUser("id", id) : legacy.getUserById(id);
}
export async function pendingCode(
  email: string,
  purpose: EmailCode["purpose"],
) {
  return authUsesPostgres() ? undefined : legacy.peekCode(email, purpose);
}
export async function registerUsername(email: string, passwordHash: string) {
  assertAuthWritable();
  if (authUsesPostgres()) return pg.registerUsername(email, passwordHash);
  if (legacy.getUserByEmail(email))
    throw new AuthError("用户名已被使用，请换一个或直接登录", 409);
  const id = crypto.randomUUID();
  legacy.upsertUser({
    id, email, passwordHash, campusVerifiedAt: null, trialEndsAt: null,
    membership: "expired", lifetimeGrantedAt: null,
    createdAt: new Date().toISOString(), devices: [],
  });
  return id;
}

export async function registerWithCode(
  email: string,
  passwordHash: string,
  code: EmailCode,
) {
  assertAuthWritable();
  if (authUsesPostgres())
    return pg.registerUserWithCode(email, passwordHash, code);
  const prior = legacy.getUserByEmail(email);
  if (prior?.campusVerifiedAt)
    throw new AuthError("该邮箱已注册，请直接登录", 409);
  const user: User = prior || {
    id: crypto.randomUUID(),
    email,
    passwordHash,
    campusVerifiedAt: null,
    trialEndsAt: null,
    membership: "trial",
    lifetimeGrantedAt: null,
    createdAt: new Date().toISOString(),
    devices: [],
  };
  user.passwordHash = passwordHash;
  legacy.upsertUser(user);
  legacy.saveCode(code);
  return user.id;
}
export async function verifyRegistration(email: string, code: string) {
  assertAuthWritable();
  if (authUsesPostgres()) return pg.verifyRegistration(email, code);
  const user = legacy.getUserByEmail(email);
  if (!user || !legacy.consumeCode(email, code, "register"))
    throw new AuthError("验证码无效或已过期", 400);
  if (!user.campusVerifiedAt) {
    user.campusVerifiedAt = new Date().toISOString();
    user.trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
    user.membership = "trial";
    legacy.upsertUser(user);
  }
  return user;
}
export async function recordLogin(
  user: User,
  deviceId: string,
  label: string,
  replace: boolean,
) {
  assertAuthWritable();
  if (authUsesPostgres()) return pg.recordLogin(user, deviceId, label, replace);
  const existing = user.devices.find((d) => d.id === deviceId),
    active = legacy.activeDevices(user);
  if ((!existing || existing.revoked) && active.length >= 2) {
    if (!replace)
      throw new AuthError(
        "该账号已在 2 台设备登录，可注销最旧设备后继续",
        409,
        "DEVICE_LIMIT",
      );
    active.sort((a, b) => a.lastSeen.localeCompare(b.lastSeen))[0].revoked =
      true;
  }
  if (existing)
    Object.assign(existing, {
      revoked: false,
      label,
      lastSeen: new Date().toISOString(),
    });
  else
    user.devices.push({
      id: deviceId,
      label,
      lastSeen: new Date().toISOString(),
      revoked: false,
    });
  legacy.upsertUser(user);
  return null;
}
export async function revokeDevice(userId: string, deviceId: string) {
  assertAuthWritable();
  if (authUsesPostgres()) return pg.revokeDevice(userId, deviceId);
  const user = legacy.getUserById(userId);
  const d = user?.devices.find((d) => d.id === deviceId);
  if (!user || !d) throw new AuthError("设备不存在", 404);
  d.revoked = true;
  legacy.upsertUser(user);
  return user;
}
export async function setMembership(userId: string, grant: boolean) {
  assertAuthWritable();
  if (authUsesPostgres()) return pg.setMembership(userId, grant);
  const user = legacy.getUserById(userId);
  if (!user) throw new AuthError("用户不存在", 404);
  user.membership = grant ? "lifetime" : "expired";
  user.lifetimeGrantedAt = grant ? new Date().toISOString() : null;
  legacy.upsertUser(user);
  return user;
}
