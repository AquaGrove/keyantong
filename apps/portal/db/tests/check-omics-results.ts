import assert from "node:assert/strict";
import { dbPool, closeDatabases } from "../../src/lib/db/pool";
import { downloadUrl } from "../../src/lib/storage/objects";
async function main() {
  if (
    !new URL(process.env.DATABASE_MIGRATION_URL!).pathname.endsWith(
      "_validation",
    )
  )
    throw new Error("Validation only");
  const rows = (
    await dbPool("migration").query(
      "SELECT id,owner_id,status,parameters,result_object_id,last_error FROM kt_ops.tasks WHERE kind='omics' ORDER BY created_at DESC LIMIT 10",
    )
  ).rows;
  assert.ok(rows.length >= 2);
  for (const r of rows) {
    assert.equal(r.status, "succeeded", r.last_error || r.status);
    assert.ok(r.parameters.summary);
    const downloaded = await fetch(
      await downloadUrl(r.owner_id, r.result_object_id),
    );
    assert.equal(downloaded.status, 200);
    const bytes = Buffer.from(await downloaded.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
  }
  console.log(
    JSON.stringify({
      ok: true,
      completed: rows.length,
      privateResultsDownloaded: true,
      methods: [...new Set(rows.map((r) => r.parameters.method))],
    }),
  );
}
main()
  .finally(closeDatabases)
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
