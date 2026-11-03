import fs from "node:fs";
import path from "node:path";

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
};

export type EmailCode = {
  email: string;
  code: string;
  expiresAt: string;
  purpose: "register" | "login";
};

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

const DATA_DIR = resolveDataDir();

export function dataDir(): string {
  return DATA_DIR;
}

function dbPath() {
  return path.join(DATA_DIR, "users.json");
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
    return empty();
  }
}

function writeDb(db: DbFile) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${dbPath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbPath());
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
  db.codes = db.codes.filter((c) => c.email !== code.email || c.purpose !== code.purpose);
  db.codes.push(code);
  writeDb(db);
}

export function consumeCode(email: string, code: string, purpose: EmailCode["purpose"]): boolean {
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

export function peekCode(email: string, purpose: EmailCode["purpose"]): EmailCode | undefined {
  const db = readDb();
  return db.codes.find((c) => c.email === email && c.purpose === purpose);
}

export function membershipStatus(user: User): Membership {
  if (user.membership === "lifetime") return "lifetime";
  if (user.trialEndsAt && Date.parse(user.trialEndsAt) > Date.now()) return "trial";
  return "expired";
}

export function isEntitled(user: User | undefined): boolean {
  if (!user?.campusVerifiedAt) return false;
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
    email: user.email,
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
