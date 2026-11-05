import { isUsernameAccount } from "./account-name";
import fs from "node:fs";
import path from "node:path";

import type { User, EmailCode, Device, Membership } from "./types";
export type { User, Device, Membership, EmailCode } from "./types";

type DbFile = {
  users: User[];
  codes: EmailCode[];
};

function resolveDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const monorepo = path.join(process.cwd(), "..", "..", "data");
  if (fs.existsSync(monorepo)) return monorepo;
  return path.join(process.cwd(), "data");
}

function dbPath() {
  return path.join(resolveDataDir(), "users.json");
}

function empty(): DbFile {
  return { users: [], codes: [] };
}

function readDb(): DbFile {
  try {
    const p = dbPath();
    if (!fs.existsSync(p)) return empty();
    return JSON.parse(fs.readFileSync(p, "utf8")) as DbFile;
  } catch {
    throw new Error("用户数据读取失败，已停止账号写入；请检查备份与数据完整性");
  }
}

function writeDb(db: DbFile) {
  try {
    fs.mkdirSync(resolveDataDir(), { recursive: true });
    const tmp = `${dbPath()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, dbPath());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`无法写入用户数据目录（${resolveDataDir()}）：${msg}`);
  }
}

export function listUsers(): User[] {
  return readDb().users;
}

export function getUserByEmail(email: string): User | undefined {
  return readDb().users.find((u) => u.email === email);
}

export function getUserById(id: string): User | undefined {
  return readDb().users.find((u) => u.id === id);
}

export function upsertUser(user: User) {
  const db = readDb();
  const i = db.users.findIndex((u) => u.id === user.id);
  if (i >= 0) db.users[i] = user;
  else db.users.push(user);
  writeDb(db);
}

export function saveCode(code: EmailCode) {
  const db = readDb();
  db.codes = db.codes.filter(
    (c) => c.email !== code.email || c.purpose !== code.purpose,
  );
  db.codes.push(code);
  writeDb(db);
}

export function consumeCode(
  email: string,
  code: string,
  purpose: EmailCode["purpose"],
): boolean {
  const db = readDb();
  const now = Date.now();
  const i = db.codes.findIndex(
    (c) =>
      c.email === email &&
      c.purpose === purpose &&
      c.code === code &&
      Date.parse(c.expiresAt) > now,
  );
  if (i < 0) return false;
  db.codes.splice(i, 1);
  writeDb(db);
  return true;
}

export function peekCode(
  email: string,
  purpose: EmailCode["purpose"],
): EmailCode | undefined {
  const db = readDb();
  return db.codes.find((c) => c.email === email && c.purpose === purpose);
}

export function membershipStatus(user: User): Membership {
  if (user.membership === "lifetime") return "lifetime";
  if (user.trialEndsAt && Date.parse(user.trialEndsAt) > Date.now())
    return "trial";
  return "expired";
}

export function isEntitled(user: User | undefined): boolean {
  if (!user) return false;
  if (isUsernameAccount(user.email)) return user.membership === "lifetime";
  if (!user.campusVerifiedAt) return false;
  const s = membershipStatus(user);
  return s === "trial" || s === "lifetime";
}

export const MAX_DEVICES = 2;

export function activeDevices(user: User): Device[] {
  return user.devices.filter((d) => !d.revoked);
}

export function publicUser(user: User) {
  const status = membershipStatus(user);
  return {
    id: user.id,
    email: isUsernameAccount(user.email) ? null : user.email,
    username: isUsernameAccount(user.email) ? user.email.split("@")[0] : null,
    campusVerified: Boolean(user.campusVerifiedAt),
    membership: status,
    trialEndsAt: user.trialEndsAt,
    lifetimeGrantedAt: user.lifetimeGrantedAt,
    devices: activeDevices(user).map((d) => ({
      id: d.id,
      label: d.label,
      lastSeen: d.lastSeen,
    })),
    entitled: isEntitled({ ...user, membership: status }),
  };
}
