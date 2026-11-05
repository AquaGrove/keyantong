import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { transaction, authUsesPostgres } from "../db/pool";
import seeds from "../../../../../catalog/resources/curated.json";
import { resourceInput } from "./validation";
import type { ResearchResource } from "./types";
export async function listResources(
  kind?: string,
): Promise<ResearchResource[]> {
  if (!authUsesPostgres())
    return (seeds as ResearchResource[]).filter(
      (r) => !kind || r.kind === kind,
    );
  return transaction(
    "app",
    async (c) =>
      (
        await c.query(
          "SELECT id,kind,url,content,status,version FROM kt_catalog.resources WHERE status='published' AND ($1::text IS NULL OR kind=$1) ORDER BY content->>'name'",
          [kind || null],
        )
      ).rows,
  );
}
export async function submitResource(
  actor: string,
  body: Record<string, unknown>,
  idempotencyId?: string,
  client?: PoolClient,
) {
  const { kind, url, content } = resourceInput(body);
  return resourceTransaction(
    actor,
    async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,13))", [
        actor,
      ]);
      if (idempotencyId) {
        const previous = (
          await c.query(
            "SELECT id,status,version FROM kt_catalog.resources WHERE id=$1 AND owner_id=$2",
            [idempotencyId, actor],
          )
        ).rows[0];
        if (previous) return previous;
      }
      if (
        Number(
          (
            await c.query(
              "SELECT count(*) n FROM kt_catalog.resources WHERE owner_id=$1 AND created_at>now()-interval '1 day'",
              [actor],
            )
          ).rows[0].n,
        ) >= 10
      )
        throw new Error("每天最多补充 10 条资源，请先等待审核");
      const result = await c.query(
        "INSERT INTO kt_catalog.resources(id,owner_id,kind,url,content) VALUES($1,$2,$3,$4,$5) RETURNING id,status,version",
        [idempotencyId || randomUUID(), actor, kind, url, content],
      );
      return result.rows[0];
    },
    client,
  );
}
export async function myResources(actor: string) {
  return transaction(
    "app",
    async (c) =>
      (
        await c.query(
          "SELECT id,kind,url,content,status,version,review_note,created_at FROM kt_catalog.resources WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",
          [actor],
        )
      ).rows,
    actor,
  );
}
export async function reviewQueue() {
  return transaction(
    "auth",
    async (c) =>
      (
        await c.query(
          "SELECT id,kind,url,content,status,version,review_note,created_at FROM kt_catalog.resources ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 200",
        )
      ).rows,
  );
}
export async function reviewResource(
  id: string,
  version: number,
  decision: string,
  note: string,
  linkVerified: boolean,
) {
  if (
    !["published", "rejected", "withdrawn"].includes(decision) ||
    note.trim().length < 10 ||
    note.length > 1500 ||
    !Number.isInteger(version)
  )
    throw new Error("审核须提供有效版本、决定和至少 10 字说明");
  if (decision === "published" && !linkVerified)
    throw new Error("请先核对官网、用途、许可与访问要求");
  return transaction("auth", async (c) => {
    const prior = (
      await c.query(
        "SELECT * FROM kt_catalog.resources WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!prior || prior.version !== version)
      throw new Error("条目已变化，请刷新后重新审核");
    if (prior.status === decision) throw new Error("该条目已处于此状态");
    await c.query(
      "UPDATE kt_catalog.resources SET status=$2,version=version+1,reviewed_by=$3,review_note=$4,reviewed_at=now(),updated_at=now() WHERE id=$1",
      [id, decision, "internal-admin", note.trim()],
    );
    await c.query(
      "INSERT INTO kt_catalog.reviews(id,resource_id,reviewer,decision,note) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), id, "internal-admin", decision, note.trim()],
    );
    return { ok: true };
  });
}

export async function reviseResource(
  actor: string,
  id: string,
  version: number,
  body: Record<string, unknown>,
  client?: PoolClient,
) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !Number.isInteger(version))
    throw new Error("无效资源版本");
  const { kind, url, content } = resourceInput(body);
  return resourceTransaction(
    actor,
    async (c) => {
      const row = (
        await c.query(
          "SELECT id,status,version,kind FROM kt_catalog.resources WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [id, actor],
        )
      ).rows[0];
      if (
        !row ||
        row.version !== version ||
        !["pending", "rejected", "withdrawn"].includes(row.status) ||
        row.kind !== kind
      )
        throw new Error("该资源不可修订或版本已变化，请刷新提交记录");
      return (
        await c.query(
          "UPDATE kt_catalog.resources SET url=$2,content=$3,status='pending',version=version+1,reviewed_by=NULL,review_note=NULL,reviewed_at=NULL,updated_at=now() WHERE id=$1 RETURNING id,status,version",
          [id, url, content],
        )
      ).rows[0];
    },
    client,
  );
}

async function resourceTransaction<T>(
  actor: string,
  fn: (c: PoolClient) => Promise<T>,
  client?: PoolClient,
) {
  return client ? fn(client) : transaction("app", fn, actor);
}
