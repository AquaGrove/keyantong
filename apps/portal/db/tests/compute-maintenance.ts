import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dbPool, closeDatabases, transaction } from "../../src/lib/db/pool";
import { createAnalysis } from "../../src/lib/analysis/jobs";
async function pause(value: boolean) {
  await transaction("migration", async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(727411304)");
    await c.query("SELECT pg_advisory_xact_lock(727411305)");
    await c.query(
      "UPDATE kt_ops.execution_control SET paused=$1 WHERE name='omics'",
      [value],
    );
  });
}
async function main() {
  if (
    !new URL(process.env.DATABASE_MIGRATION_URL!).pathname.endsWith(
      "_validation",
    )
  )
    throw new Error("Validation only");
  const source = (
    await dbPool("migration").query(
      "SELECT * FROM kt_ops.tasks WHERE kind='omics' AND status='succeeded' AND parameters->>'method'='bsa.delta.v1' ORDER BY created_at DESC LIMIT 1",
    )
  ).rows[0];
  assert.ok(source);
  await pause(true);
  try {
    await assert.rejects(
      createAnalysis(
        source.owner_id,
        "bsa.delta.v1",
        {},
        { "counts.csv": Buffer.from("fixture") },
      ),
      (e: any) => e.status === 503,
    );
    const id = randomUUID();
    await dbPool("migration").query(
      "INSERT INTO kt_ops.tasks(id,owner_id,kind,idempotency_key,parameters) VALUES($1::uuid,$2,'omics',$1::text,$3)",
      [id, source.owner_id, source.parameters],
    );
    await new Promise((r) => setTimeout(r, 3500));
    assert.equal(
      (
        await dbPool("migration").query(
          "SELECT status FROM kt_ops.tasks WHERE id=$1",
          [id],
        )
      ).rows[0].status,
      "queued",
    );
    await pause(false);
    let status = "queued";
    for (let i = 0; i < 25; i++) {
      const r = (
        await dbPool("migration").query(
          "SELECT status,last_error FROM kt_ops.tasks WHERE id=$1",
          [id],
        )
      ).rows[0];
      status = r.status;
      if (status === "succeeded") break;
      if (status === "failed") throw new Error(r.last_error);
      await new Promise((r) => setTimeout(r, 1000));
    }
    assert.equal(status, "succeeded");
    console.log(
      JSON.stringify({
        ok: true,
        pauseBlocksIntake: true,
        pauseBlocksClaims: true,
        resumeComputes: true,
      }),
    );
  } finally {
    await pause(false);
  }
}
main()
  .finally(closeDatabases)
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
