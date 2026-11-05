import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dbPool, transaction, closeDatabases } from "../../src/lib/db/pool";
import * as auth from "../../src/lib/auth/postgres";
import { enqueueTask, claimTask, finishTask } from "../../src/lib/tasks/queue";
import {
  prepareUpload,
  completeUpload,
  downloadUrl,
} from "../../src/lib/storage/objects";
async function main() {
  // Explicit guard prevents synthetic accounts ever entering the live database.
  if (
    !new URL(process.env.DATABASE_MIGRATION_URL!).pathname.endsWith(
      "_validation",
    )
  )
    throw new Error("Integration requires isolated _validation DB");
  let checks = 0;
  const ok = () => {
    checks++;
  };
  const suffix = randomUUID();
  async function register(n: string) {
    const email = `${n}-${suffix}@example.edu`,
      code = {
        email,
        code: "123456",
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        purpose: "register" as const,
      };
    await auth.registerUserWithCode(email, "test-only-hash", code);
    return { email, code };
  }
  const a = await register("a"),
    b = await register("b");
  const outcomes = await Promise.allSettled([
    auth.verifyRegistration(a.email, a.code.code),
    auth.verifyRegistration(a.email, a.code.code),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  ok();
  const ua = (await auth.findUser("email", a.email))!;
  const ub = await auth.verifyRegistration(b.email, b.code.code);
  const attempts = await Promise.allSettled(
    ["one", "two", "three", "four"].map((d) =>
      auth.recordLogin(ua, d, d, false),
    ),
  );
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 2);
  ok();
  const initial = attempts.find(
    (r) => r.status === "fulfilled",
  ) as PromiseFulfilledResult<string>;
  assert.equal((await auth.userForSession(initial.value))?.id, ua.id);
  ok();
  await auth.revokeDevice(
    ua.id,
    initial.value
      ? (await auth.findUser("id", ua.id))!.devices.find((d) => !d.revoked)!.id
      : "",
  );
  const token = await auth.recordLogin(ua, "replacement", "replacement", true);
  assert.equal((await auth.userForSession(token))?.id, ua.id);
  await auth.revokeSession(token);
  assert.equal(await auth.userForSession(token), null);
  ok();
  await assert.rejects(auth.revokeDevice(ub.id, "replacement"));
  ok();
  await auth.setMembership(ua.id, true);
  assert.equal((await auth.findUser("id", ua.id))!.membership, "lifetime");
  ok();
  await assert.rejects(
    dbPool("app").query("SELECT * FROM kt_auth.users"),
    (e: any) => e.code === "42501",
  );
  ok();
  const task = await enqueueTask(ua.id, "test.echo", suffix, {
    message: "hello",
  });
  assert.equal(
    (await enqueueTask(ua.id, "test.echo", suffix, { message: "hello" })).id,
    task.id,
  );
  ok();
  const hidden = await transaction(
    "app",
    async (c) =>
      (await c.query("SELECT * FROM kt_ops.tasks WHERE id=$1", [task.id])).rows,
    ub.id,
  );
  assert.equal(hidden.length, 0);
  ok();
  await assert.rejects(
    transaction(
      "app",
      (c) =>
        c.query(
          "INSERT INTO kt_ops.tasks(id,owner_id,kind,idempotency_key) VALUES($1,$2,'test.echo',$3)",
          [randomUUID(), ua.id, randomUUID()],
        ),
      ub.id,
    ),
  );
  ok();
  const claims = await Promise.all([
    claimTask("test.echo"),
    claimTask("test.echo"),
  ]);
  assert.equal(claims.filter((t) => t?.id === task.id).length, 1);
  ok();
  const claimed = claims.find((t) => t?.id === task.id)!;
  assert.equal(await finishTask(task.id, randomUUID()), false);
  assert.equal(await finishTask(task.id, claimed.lease_token), true);
  ok();
  const source = randomUUID(),
    set = randomUUID();
  await transaction(
    "app",
    async (c) => {
      await c.query(
        "INSERT INTO kt_knowledge.sources(id,owner_id,source_type,source_id,version,content_sha256) VALUES($1::uuid,$2,'test',$1::text,1,$3)",
        [source, ua.id, "a".repeat(64)],
      );
      await c.query(
        "INSERT INTO kt_knowledge.training_sets(id,owner_id,version) VALUES($1,$2,'1')",
        [set, ua.id],
      );
    },
    ua.id,
  );
  await assert.rejects(
    transaction(
      "app",
      (c) =>
        c.query(
          "INSERT INTO kt_knowledge.training_members(dataset_id,source_id,owner_id) VALUES($1,$2,$3)",
          [set, source, ua.id],
        ),
      ua.id,
    ),
  );
  ok();
  await transaction(
    "app",
    async (c) => {
      assert.equal(
        (
          await c.query("SELECT * FROM kt_knowledge.rag_sources WHERE id=$1", [
            source,
          ])
        ).rowCount,
        0,
      );
      await c.query(
        "UPDATE kt_knowledge.sources SET allow_training=true,allow_rag=true,license='CC-BY-4.0',consent_version='test-v1',consent_recorded_at=now(),review_status='approved' WHERE id=$1",
        [source],
      );
      await c.query(
        "INSERT INTO kt_knowledge.training_members(dataset_id,source_id,owner_id) VALUES($1,$2,$3)",
        [set, source, ua.id],
      );
      await c.query(
        "UPDATE kt_knowledge.training_sets SET status='approved' WHERE id=$1",
        [set],
      );
      assert.equal(
        (
          await c.query(
            "SELECT * FROM kt_knowledge.training_export WHERE dataset_id=$1",
            [set],
          )
        ).rowCount,
        1,
      );
      await c.query(
        "UPDATE kt_knowledge.sources SET allow_training=false WHERE id=$1",
        [source],
      );
      assert.equal(
        (
          await c.query(
            "SELECT * FROM kt_knowledge.training_export WHERE dataset_id=$1",
            [set],
          )
        ).rowCount,
        0,
      );
    },
    ua.id,
  );
  ok();
  // Optional real S3 validation; deployment must run this with the private test bucket.
  if (process.env.S3_ENDPOINT) {
    const { createHash } = await import("node:crypto");
    const body = Buffer.from("keyantong object integrity test");
    const upload = await prepareUpload(ua.id, {
      mediaType: "text/plain",
      size: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
    });
    const sent = await fetch(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body,
    });
    assert.equal(
      sent.ok,
      true,
      `S3 PUT ${sent.status}: ${sent.ok ? "" : await sent.text()}`,
    );
    await completeUpload(ua.id, upload.id);
    assert.equal(
      await (await fetch(await downloadUrl(ua.id, upload.id))).text(),
      body.toString(),
    );
    ok();
    await assert.rejects(downloadUrl(ub.id, upload.id));
    ok();
    await assert.rejects(
      transaction(
        "app",
        (c) =>
          c.query("UPDATE kt_ops.tasks SET input_object_id=$2 WHERE id=$1", [
            task.id,
            upload.id,
          ]),
        ub.id,
      ).then((r) => {
        if (r.rowCount === 0) throw new Error("denied");
      }),
    );
    ok();
  }
  console.log(JSON.stringify({ ok: true, checks, isolated: true }));
}
main()
  .finally(closeDatabases)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
