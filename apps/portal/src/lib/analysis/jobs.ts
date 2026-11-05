import { randomUUID, createHash } from "node:crypto";
import { transaction } from "../db/pool";
import { storePrivateObject } from "../storage/objects";
import { METHODS, validateConfig } from "./methods";
export async function analysisJobs(actor: string, id?: string) {
  return transaction(
    "app",
    async (c) =>
      (
        await c.query(
          "SELECT id,kind,status,parameters,result_object_id,last_error,attempts,created_at,updated_at FROM kt_ops.tasks WHERE owner_id=$1 AND kind IN ('omics','omics.prepare') AND ($2::uuid IS NULL OR id=$2) ORDER BY created_at DESC LIMIT 30",
          [actor, id || null],
        )
      ).rows,
    actor,
  );
}
export async function createAnalysis(
  actor: string,
  method: string,
  configRaw: Record<string, unknown>,
  files: Record<string, Buffer>,
) {
  const descriptor = METHODS.find((m) => m.id === method);
  if (!descriptor) throw new Error("方法尚未开放执行");
  const config = validateConfig(method, configRaw);
  if (
    JSON.stringify(Object.keys(files).sort()) !==
    JSON.stringify([...descriptor.files].sort())
  )
    throw new Error("输入文件清单不完整");
  for (const data of Object.values(files))
    if (data.length === 0 || data.length > 12 * 1024 * 1024)
      throw new Error("单文件必须为 1 字节至 12 MB");
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        method,
        config,
        files: Object.entries(files)
          .sort()
          .map(([k, v]) => [k, createHash("sha256").update(v).digest("hex")]),
      }),
    )
    .digest("hex");
  const reserved = await transaction(
    "app",
    async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(727411304)");
      if (
        (
          await c.query(
            "SELECT paused FROM kt_ops.execution_control WHERE name='omics'",
          )
        ).rows[0]?.paused
      )
        throw Object.assign(new Error("分析环境正在备份维护，请稍后重新提交"), {
          status: 503,
        });
      const existing = (
        await c.query(
          "SELECT id FROM kt_ops.tasks WHERE owner_id=$1 AND kind IN ('omics','omics.prepare') AND parameters->>'fingerprint'=$2 AND status IN ('queued','running','succeeded') ORDER BY created_at DESC LIMIT 1",
          [actor, fingerprint],
        )
      ).rows[0];
      if (existing) return { id: existing.id, reused: true };
      const active = Number(
        (
          await c.query(
            "SELECT count(*) n FROM kt_ops.tasks WHERE owner_id=$1 AND kind IN ('omics','omics.prepare') AND status IN ('queued','running')",
            [actor],
          )
        ).rows[0].n,
      );
      if (
        active >= 2 ||
        Number(
          (await c.query("SELECT kt_ops.omics_queue_size() n")).rows[0].n,
        ) >= 8
      )
        throw new Error("任务队列已满：每人最多 2 个活动任务，全站最多 8 个");
      const id = randomUUID();
      await c.query(
        "INSERT INTO kt_ops.tasks(id,owner_id,kind,idempotency_key,parameters,max_attempts) VALUES($1::uuid,$2,'omics.prepare',$1::text,$3,2)",
        [id, actor, { method, config, fingerprint, files: {} }],
      );
      return { id, reused: false };
    },
    actor,
  );
  if (reserved.reused) return reserved;
  try {
    const objects: Record<string, string> = {};
    for (const [name, data] of Object.entries(files))
      objects[name] = await storePrivateObject(actor, data, "text/csv");
    await transaction(
      "app",
      async (c) => {
        const result = await c.query(
          "UPDATE kt_ops.tasks SET kind='omics',parameters=$3,updated_at=now() WHERE id=$1 AND owner_id=$2 AND kind='omics.prepare' AND status='queued' RETURNING id",
          [reserved.id, actor, { method, config, fingerprint, files: objects }],
        );
        if (!result.rowCount) throw new Error("任务准备状态已变化，请重新提交");
        await c.query(
          "INSERT INTO kt_ops.outbox(id,topic,aggregate_id,owner_id,payload) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            "omics.queued",
            reserved.id,
            actor,
            { taskId: reserved.id, method },
          ],
        );
      },
      actor,
    );
    return reserved;
  } catch (e) {
    await transaction(
      "app",
      (c) =>
        c.query(
          "UPDATE kt_ops.tasks SET status='failed',last_error='输入准备未完成，请重新提交',updated_at=now() WHERE id=$1 AND owner_id=$2 AND kind='omics.prepare'",
          [reserved.id, actor],
        ),
      actor,
    );
    throw e;
  }
}
