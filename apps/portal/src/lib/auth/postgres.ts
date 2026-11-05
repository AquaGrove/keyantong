import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { PoolClient } from "pg";
import { dbPool, transaction, assertAuthWritable } from "@/lib/db/pool";
import { AuthError, type User, type EmailCode } from "./types";
import { isUsernameAccount } from "./account-name";
const iso = (value: Date | string | null) =>
  value ? new Date(value).toISOString() : null;
const queryUser = `SELECT u.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'lastSeen',d.last_seen,'revoked',d.revoked) ORDER BY d.last_seen) FROM kt_auth.devices d WHERE d.user_id=u.id),'[]'::jsonb) AS devices FROM kt_auth.users u`;
function mapUser(row: Record<string, any>): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    campusVerifiedAt: iso(row.campus_verified_at),
    trialEndsAt: iso(row.trial_ends_at),
    membership: row.membership,
    lifetimeGrantedAt: iso(row.lifetime_granted_at),
    createdAt: iso(row.created_at)!,
    role: row.account_role,
    devices: row.devices.map((d: any) => ({ ...d, lastSeen: iso(d.lastSeen) })),
  };
}
export async function findUser(field: "id" | "email", value: string) {
  const result = await dbPool("auth").query(
    `${queryUser} WHERE u.${field}=$1 AND u.disabled_at IS NULL`,
    [value],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : undefined;
}
export async function allUsers() {
  return (
    await dbPool("auth").query(
      `${queryUser} WHERE u.disabled_at IS NULL ORDER BY u.created_at`,
    )
  ).rows.map(mapUser);
}
export function codeHash(email: string, purpose: string, code: string) {
  const secret =
    process.env.VERIFICATION_CODE_SECRET || process.env.USER_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("验证码哈希密钥未配置或长度不足");
  return createHmac("sha256", secret)
    .update(`${email}\0${purpose}\0${code}`)
    .digest("hex");
}
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
async function audit(
  c: PoolClient,
  subject: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  await c.query(
    "INSERT INTO kt_auth.audit_events(id,subject_id,action,details) VALUES($1,$2,$3,$4)",
    [randomUUID(), subject, action, JSON.stringify(details)],
  );
}
async function event(c: PoolClient, userId: string, topic: string) {
  await c.query(
    "INSERT INTO kt_ops.outbox(id,topic,aggregate_id,owner_id,payload) VALUES($1,$2,$3,$3,$4)",
    [randomUUID(), topic, userId, JSON.stringify({ userId })],
  );
}
export async function registerUsername(email: string, passwordHash: string) {
  assertAuthWritable();
  return transaction("auth", async (c) => {
    const id = randomUUID();
    const result = await c.query(
      "INSERT INTO kt_auth.users(id,email,password_hash,membership) VALUES($1,$2,$3,'expired') ON CONFLICT(email) DO NOTHING",
      [id, email, passwordHash],
    );
    if (result.rowCount !== 1) throw new AuthError("用户名已被使用，请换一个或直接登录", 409);
    await audit(c, id, "registration.username");
    return id;
  });
}

export async function registerUserWithCode(
  email: string,
  passwordHash: string,
  code: EmailCode,
) {
  assertAuthWritable();
  return transaction("auth", async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      email,
    ]);
    const prior = (
      await c.query(
        "SELECT id,campus_verified_at FROM kt_auth.users WHERE email=$1 FOR UPDATE",
        [email],
      )
    ).rows[0];
    if (prior?.campus_verified_at)
      throw new AuthError("该邮箱已注册，请直接登录", 409);
    const id = prior?.id || randomUUID();
    if (prior)
      await c.query(
        "UPDATE kt_auth.users SET password_hash=$2,updated_at=now(),version=version+1 WHERE id=$1",
        [id, passwordHash],
      );
    else
      await c.query(
        "INSERT INTO kt_auth.users(id,email,password_hash,membership) VALUES($1,$2,$3,'trial')",
        [id, email, passwordHash],
      );
    await c.query(
      "INSERT INTO kt_auth.verification_codes(email,purpose,code_hash,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(email,purpose) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0",
      [
        email,
        code.purpose,
        codeHash(email, code.purpose, code.code),
        code.expiresAt,
      ],
    );
    await audit(c, id, "registration.requested");
    return id;
  });
}
export async function verifyRegistration(email: string, code: string) {
  assertAuthWritable();
  const valid = await transaction("auth", async (c) => {
    const user = (
      await c.query(
        "SELECT * FROM kt_auth.users WHERE email=$1 AND disabled_at IS NULL FOR UPDATE",
        [email],
      )
    ).rows[0];
    if (!user) return false;
    const row = (
      await c.query(
        "SELECT * FROM kt_auth.verification_codes WHERE email=$1 AND purpose='register' FOR UPDATE",
        [email],
      )
    ).rows[0];
    if (
      !row ||
      new Date(row.expires_at).getTime() <= Date.now() ||
      row.attempts >= 5
    )
      return false;
    const expected = Buffer.from(row.code_hash),
      got = Buffer.from(codeHash(email, "register", code));
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
      await c.query(
        "UPDATE kt_auth.verification_codes SET attempts=attempts+1 WHERE email=$1 AND purpose='register'",
        [email],
      );
      return false;
    }
    await c.query(
      "DELETE FROM kt_auth.verification_codes WHERE email=$1 AND purpose='register'",
      [email],
    );
    if (!user.campus_verified_at)
      await c.query(
        "UPDATE kt_auth.users SET campus_verified_at=now(),trial_ends_at=now()+interval '7 days',membership='trial',updated_at=now(),version=version+1 WHERE id=$1",
        [user.id],
      );
    await audit(c, user.id, "registration.verified");
    await event(c, user.id, "identity.verified");
    return true;
  });
  if (!valid) throw new AuthError("验证码无效或已过期", 400);
  return (await findUser("email", email))!;
}
export async function recordLogin(
  user: User,
  deviceId: string,
  label: string,
  replaceOldest: boolean,
) {
  assertAuthWritable();
  return transaction("auth", async (c) => {
    const fresh = (
      await c.query("SELECT * FROM kt_auth.users WHERE id=$1 FOR UPDATE", [
        user.id,
      ])
    ).rows[0];
    if (
      !fresh ||
      fresh.disabled_at ||
      fresh.password_hash !== user.passwordHash
    )
      throw new AuthError("账号信息已变化，请重新登录", 401);
    if (!fresh.campus_verified_at && !isUsernameAccount(fresh.email))
      throw new AuthError("请先完成校园邮箱验证", 403, "NEED_VERIFY");
    const devices = (
      await c.query(
        "SELECT * FROM kt_auth.devices WHERE user_id=$1 ORDER BY last_seen,id FOR UPDATE",
        [user.id],
      )
    ).rows;
    const existing = devices.find((d) => d.id === deviceId),
      active = devices.filter((d) => !d.revoked);
    if ((!existing || existing.revoked) && active.length >= 2) {
      if (!replaceOldest)
        throw new AuthError(
          "该账号已在 2 台设备登录，可注销最旧设备后继续",
          409,
          "DEVICE_LIMIT",
        );
      await c.query(
        "UPDATE kt_auth.devices SET revoked=true WHERE user_id=$1 AND id=$2",
        [user.id, active[0].id],
      );
      await c.query(
        "UPDATE kt_auth.sessions SET revoked_at=now() WHERE user_id=$1 AND device_id=$2 AND revoked_at IS NULL",
        [user.id, active[0].id],
      );
    }
    await c.query(
      "INSERT INTO kt_auth.devices(user_id,id,label,last_seen) VALUES($1,$2,$3,now()) ON CONFLICT(user_id,id) DO UPDATE SET label=excluded.label,last_seen=now(),revoked=false",
      [user.id, deviceId, label],
    );
    const id = randomUUID(),
      token = randomBytes(32).toString("base64url");
    await c.query(
      "INSERT INTO kt_auth.sessions(id,user_id,device_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '14 days')",
      [id, user.id, deviceId, tokenHash(token)],
    );
    await audit(c, user.id, "session.created", { deviceId });
    return `s.${id}.${token}`;
  });
}
export async function userForSession(cookie: string | undefined) {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== "s" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      parts[1],
    ) ||
    parts[2].length > 100
  )
    return null;
  const r = await dbPool("auth").query(
    "SELECT s.user_id FROM kt_auth.sessions s JOIN kt_auth.devices d ON d.user_id=s.user_id AND d.id=s.device_id JOIN kt_auth.users u ON u.id=s.user_id WHERE s.id=$1 AND s.token_hash=$2 AND s.expires_at>now() AND s.revoked_at IS NULL AND NOT d.revoked AND u.disabled_at IS NULL AND (u.campus_verified_at IS NOT NULL OR u.email LIKE '%@account.keyantong.invalid')",
    [parts[1], tokenHash(parts[2])],
  );
  return r.rows[0] ? (await findUser("id", r.rows[0].user_id)) || null : null;
}
export async function revokeSession(cookie: string | undefined) {
  if (!cookie?.startsWith("s.")) return;
  const parts = cookie.split(".");
  if (
    parts.length !== 3 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      parts[1],
    )
  )
    return;
  await dbPool("auth").query(
    "UPDATE kt_auth.sessions SET revoked_at=now() WHERE id=$1 AND token_hash=$2",
    [parts[1], tokenHash(parts[2])],
  );
}
export async function revokeDevice(userId: string, deviceId: string) {
  assertAuthWritable();
  await transaction("auth", async (c) => {
    await c.query("SELECT id FROM kt_auth.users WHERE id=$1 FOR UPDATE", [
      userId,
    ]);
    const r = await c.query(
      "UPDATE kt_auth.devices SET revoked=true WHERE user_id=$1 AND id=$2 RETURNING id",
      [userId, deviceId],
    );
    if (!r.rowCount) throw new AuthError("设备不存在", 404);
    await c.query(
      "UPDATE kt_auth.sessions SET revoked_at=now() WHERE user_id=$1 AND device_id=$2 AND revoked_at IS NULL",
      [userId, deviceId],
    );
    await audit(c, userId, "device.revoked", { deviceId });
  });
  return (await findUser("id", userId))!;
}
export async function setMembership(userId: string, grant: boolean) {
  assertAuthWritable();
  await transaction("auth", async (c) => {
    const r = await c.query(
      "UPDATE kt_auth.users SET membership=$2,lifetime_granted_at=CASE WHEN $3 THEN now() ELSE NULL END,updated_at=now(),version=version+1 WHERE id=$1 RETURNING id",
      [userId, grant ? "lifetime" : "expired", grant],
    );
    if (!r.rowCount) throw new AuthError("用户不存在", 404);
    await audit(
      c,
      userId,
      grant ? "membership.granted" : "membership.revoked",
      { actor: "internal-admin" },
    );
    await event(c, userId, "identity.membership_changed");
  });
  return (await findUser("id", userId))!;
}
