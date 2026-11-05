import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { transaction, closeDatabases } from "../../src/lib/db/pool";
let running = true;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
async function main() {
  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on("error", () =>
    console.error("Redis unavailable; PostgreSQL outbox retained"),
  );
  await redis.connect();
  try {
    do {
      const token = randomUUID();
      const rows = await transaction(
        "dispatcher",
        async (c) =>
          (
            await c.query(
              "WITH pending AS (SELECT id FROM kt_ops.outbox WHERE ((state='pending' AND available_at<=now()) OR (state='leased' AND lease_until<now())) AND attempts<10 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100) UPDATE kt_ops.outbox o SET state='leased',lease_token=$1,lease_until=now()+interval '30 seconds',attempts=attempts+1 FROM pending WHERE o.id=pending.id RETURNING o.*",
              [token],
            )
          ).rows,
      );
      for (const row of rows) {
        try {
          await redis.xAdd(
            process.env.TASK_STREAM || "kt:events",
            "*",
            {
              eventId: row.id,
              topic: row.topic,
              aggregateId: row.aggregate_id,
              payload: JSON.stringify(row.payload),
            },
            {
              TRIM: {
                strategy: "MAXLEN",
                strategyModifier: "~",
                threshold: 10000,
              },
            },
          );
          await transaction("dispatcher", (c) =>
            c.query(
              "UPDATE kt_ops.outbox SET state='published',published_at=now(),lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",
              [row.id, token],
            ),
          );
        } catch {
          await transaction("dispatcher", (c) =>
            c.query(
              "UPDATE kt_ops.outbox SET state=CASE WHEN attempts>=10 THEN 'dead' ELSE 'pending' END,available_at=now()+interval '30 seconds',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2",
              [row.id, token],
            ),
          );
        }
      }
      await transaction("dispatcher", (c) =>
        c.query(
          "UPDATE kt_ops.outbox SET state='dead',lease_token=NULL,lease_until=NULL WHERE state='leased' AND lease_until<now() AND attempts>=10",
        ),
      );
      if (!process.argv.includes("--once") && running)
        await new Promise((r) => setTimeout(r, 1000));
    } while (running && !process.argv.includes("--once"));
  } finally {
    await redis.quit();
  }
}
main()
  .finally(closeDatabases)
  .catch(() => {
    console.error("Dispatcher stopped");
    process.exitCode = 1;
  });
