import { Pool, type PoolClient } from "pg";
const pools = new Map<string, Pool>();
export type DatabaseScope = "auth" | "app" | "dispatcher" | "migration";
export function dbPool(scope: DatabaseScope = "app") {
  const key = {
    auth: "DATABASE_AUTH_URL",
    app: "DATABASE_APP_URL",
    dispatcher: "DATABASE_WORKER_URL",
    migration: "DATABASE_MIGRATION_URL",
  }[scope];
  const url = process.env[key];
  if (!url) throw new Error(`${key} 未配置`);
  const existing = pools.get(scope);
  if (existing) return existing;
  const pool = new Pool({
    connectionString: url,
    max: scope === "migration" ? 1 : 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    application_name: `keyantong-${scope}`,
  });
  pool.on("error", () =>
    console.error(`[database/${scope}] idle connection failed`),
  );
  pools.set(scope, pool);
  return pool;
}
export async function transaction<T>(
  scope: DatabaseScope,
  fn: (client: PoolClient) => Promise<T>,
  actorId?: string,
): Promise<T> {
  const client = await dbPool(scope).connect();
  try {
    await client.query("BEGIN");
    if (actorId)
      await client.query("SELECT set_config('kt.actor_id',$1,true)", [actorId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
export async function closeDatabases() {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}
export function authUsesPostgres() {
  const backend = process.env.AUTH_STORE || "json";
  if (!["json", "postgres"].includes(backend))
    throw new Error("AUTH_STORE 只能为 json 或 postgres");
  return backend === "postgres";
}
export function assertAuthWritable() {
  if (process.env.AUTH_MAINTENANCE === "1")
    throw new Error("账号服务正在迁移维护，请稍后重试");
}
