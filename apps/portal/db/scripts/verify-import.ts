import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { allUsers } from "../../src/lib/auth/postgres";
import { closeDatabases } from "../../src/lib/db/pool";
async function main() {
  const source = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
  const users = await allUsers();
  assert.equal(users.length, source.users.length);
  for (const a of source.users) {
    const b = users.find((u) => u.id === a.id);
    assert.ok(b);
    for (const key of [
      "id",
      "email",
      "passwordHash",
      "campusVerifiedAt",
      "trialEndsAt",
      "membership",
      "lifetimeGrantedAt",
      "createdAt",
    ] as const)
      assert.equal(b[key], a[key], `Identity field mismatch: ${key}`);
    assert.deepEqual(
      [...b.devices].sort((x, y) => x.id.localeCompare(y.id)),
      [...a.devices].sort((x, y) => x.id.localeCompare(y.id)),
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      users: users.length,
      devices: users.reduce((n, u) => n + u.devices.length, 0),
      passwordHashesPreserved: true,
    }),
  );
}
main()
  .finally(closeDatabases)
  .catch(() => {
    console.error("Import verification failed; DO NOT CUT OVER");
    process.exitCode = 1;
  });
