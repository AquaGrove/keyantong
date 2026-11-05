import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dbPool, closeDatabases, transaction } from "../../src/lib/db/pool";
import { codeHash } from "../../src/lib/auth/postgres";
import type { User, EmailCode } from "../../src/lib/auth/types";
export async function importUsers(filename: string) {
  const bytes = await fs.readFile(filename),
    sha = createHash("sha256").update(bytes).digest("hex");
  const data = JSON.parse(bytes.toString()) as {
    users: User[];
    codes: EmailCode[];
  };
  if (!Array.isArray(data.users) || !Array.isArray(data.codes))
    throw new Error("Invalid source");
  const ids = new Set(),
    emails = new Set();
  const date = (v: string | null) => {
    if (v !== null && !Number.isFinite(Date.parse(v)))
      throw new Error("Invalid source timestamp");
    return v;
  };
  for (const u of data.users) {
    if (
      typeof u.id !== "string" ||
      !u.id ||
      ids.has(u.id) ||
      typeof u.email !== "string" ||
      u.email !== u.email.trim().toLowerCase() ||
      emails.has(u.email) ||
      !u.passwordHash ||
      !["trial", "lifetime", "expired"].includes(u.membership) ||
      !Array.isArray(u.devices)
    )
      throw new Error("Invalid or duplicate identity");
    ids.add(u.id);
    emails.add(u.email);
    [
      u.createdAt,
      u.campusVerifiedAt,
      u.trialEndsAt,
      u.lifetimeGrantedAt,
    ].forEach(date);
    if (new Set(u.devices.map((d) => d.id)).size !== u.devices.length)
      throw new Error("Duplicate device");
    for (const d of u.devices) {
      date(d.lastSeen);
      if (!d.id || typeof d.revoked !== "boolean")
        throw new Error("Invalid device");
    }
  }
  return transaction("migration", async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(727411303)");
    if (
      (
        await c.query(
          "SELECT id FROM kt_ops.data_imports WHERE scope='identity' AND source_sha256=$1",
          [sha],
        )
      ).rowCount
    )
      return { alreadyImported: true, users: data.users.length, sha };
    if (
      Number(
        (await c.query("SELECT count(*) AS n FROM kt_auth.users")).rows[0].n,
      ) !== 0
    )
      throw new Error("Refusing import into nonempty identity store");
    for (const u of data.users) {
      await c.query(
        "INSERT INTO kt_auth.users(id,email,password_hash,campus_verified_at,trial_ends_at,membership,lifetime_granted_at,created_at,account_role) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          u.id,
          u.email,
          u.passwordHash,
          u.campusVerifiedAt,
          u.trialEndsAt,
          u.membership,
          u.lifetimeGrantedAt,
          u.createdAt,
          u.role || "member",
        ],
      );
      for (const d of u.devices)
        await c.query(
          "INSERT INTO kt_auth.devices(user_id,id,label,last_seen,revoked) VALUES($1,$2,$3,$4,$5)",
          [u.id, d.id, d.label, d.lastSeen, d.revoked],
        );
    }
    for (const code of data.codes) {
      if (!emails.has(code.email)) throw new Error("Orphan verification code");
      date(code.expiresAt);
      if (Date.parse(code.expiresAt) > Date.now())
        await c.query(
          "INSERT INTO kt_auth.verification_codes(email,purpose,code_hash,expires_at) VALUES($1,$2,$3,$4)",
          [
            code.email,
            code.purpose,
            codeHash(code.email, code.purpose, code.code),
            code.expiresAt,
          ],
        );
    }
    const counts = {
      users: data.users.length,
      devices: data.users.reduce((n, u) => n + u.devices.length, 0),
    };
    await c.query(
      "INSERT INTO kt_ops.data_imports(id,scope,source_sha256,counts) VALUES($1,'identity',$2,$3)",
      [randomUUID(), sha, counts],
    );
    return { ...counts, sha, alreadyImported: false };
  });
}
if (process.argv[2])
  importUsers(process.argv[2])
    .then(console.log)
    .finally(closeDatabases)
    .catch((e) => {
      console.error("Import failed:", e.message);
      process.exitCode = 1;
    });
