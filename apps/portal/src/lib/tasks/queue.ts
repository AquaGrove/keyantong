import { randomUUID } from "node:crypto";
import { transaction } from "../db/pool";
export async function enqueueTask(
  actorId: string,
  kind: string,
  key: string,
  parameters: Record<string, unknown>,
  inputObjectId?: string,
) {
  if (
    !/^[a-z][a-z0-9_.-]{0,79}$/.test(kind) ||
    !key ||
    key.length > 200 ||
    JSON.stringify(parameters).length > 65536
  )
    throw new Error("Invalid task");
  return transaction(
    "app",
    async (c) => {
      const task = (
        await c.query(
          "INSERT INTO kt_ops.tasks(id,owner_id,kind,idempotency_key,parameters,input_object_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id,kind,idempotency_key) DO UPDATE SET idempotency_key=excluded.idempotency_key RETURNING *",
          [randomUUID(), actorId, kind, key, parameters, inputObjectId || null],
        )
      ).rows[0];
      // Duplicate wake-ups are safe: PostgreSQL task claim is authoritative.
      await c.query(
        "INSERT INTO kt_ops.outbox(id,topic,aggregate_id,owner_id,payload) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          "task.queued",
          task.id,
          actorId,
          { taskId: task.id, kind },
        ],
      );
      return task;
    },
    actorId,
  );
}
export async function claimTask(kind: string) {
  return transaction("dispatcher", async (c) => {
    // Close exhausted leases so they cannot remain running forever after worker crashes.
    await c.query(
      "UPDATE kt_ops.tasks SET status='failed',lease_token=NULL,lease_until=NULL,last_error='attempts exhausted',updated_at=now() WHERE kind=$1 AND status='running' AND lease_until<now() AND attempts>=max_attempts",
      [kind],
    );
    return (
      (
        await c.query(
          "WITH candidate AS (SELECT id FROM kt_ops.tasks WHERE kind=$1 AND (status='queued' OR (status='running' AND lease_until<now())) AND attempts<max_attempts ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE kt_ops.tasks t SET status='running',attempts=attempts+1,lease_token=$2,lease_until=now()+interval '2 minutes',updated_at=now() FROM candidate WHERE t.id=candidate.id RETURNING t.*",
          [kind, randomUUID()],
        )
      ).rows[0] || null
    );
  });
}
export async function heartbeatTask(id: string, leaseToken: string) {
  return transaction(
    "dispatcher",
    async (c) =>
      (
        await c.query(
          "UPDATE kt_ops.tasks SET lease_until=now()+interval '2 minutes' WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now()",
          [id, leaseToken],
        )
      ).rowCount === 1,
  );
}
export async function finishTask(
  id: string,
  leaseToken: string,
  error?: string,
) {
  return transaction(
    "dispatcher",
    async (c) =>
      (
        await c.query(
          "UPDATE kt_ops.tasks SET status=CASE WHEN $3::text IS NULL THEN 'succeeded' WHEN attempts<max_attempts THEN 'queued' ELSE 'failed' END,last_error=$3,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now()",
          [id, leaseToken, error ? error.slice(0, 500) : null],
        )
      ).rowCount === 1,
  );
}
