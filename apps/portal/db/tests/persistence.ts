import assert from "node:assert/strict";
import { dbPool, closeDatabases } from "../../src/lib/db/pool";
import { downloadUrl } from "../../src/lib/storage/objects";
async function main() {
  if (
    !new URL(process.env.DATABASE_MIGRATION_URL!).pathname.endsWith(
      "_validation",
    )
  )
    throw new Error("Validation DB only");
  const row = (
    await dbPool("migration").query(
      "SELECT id,owner_id FROM kt_storage.objects WHERE state='ready' ORDER BY created_at DESC LIMIT 1",
    )
  ).rows[0];
  assert.ok(row);
  assert.equal(
    await (await fetch(await downloadUrl(row.owner_id, row.id))).text(),
    "keyantong object integrity test",
  );
  console.log(JSON.stringify({ ok: true, objectSurvivedRestart: true }));
}
main()
  .finally(closeDatabases)
  .catch(() => {
    console.error("Object persistence failed");
    process.exitCode = 1;
  });
