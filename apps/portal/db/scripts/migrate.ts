import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { dbPool, closeDatabases } from "../../src/lib/db/pool";
export async function migrate() {
  const client = await dbPool("migration").connect();
  try {
    await client.query("SELECT pg_advisory_lock(727411302)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS public.kt_schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await client.query("REVOKE ALL ON public.kt_schema_migrations FROM PUBLIC");
    const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
    for (const name of (await fs.readdir(dir))
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const sql = await fs.readFile(path.join(dir, name), "utf8"),
        hash = createHash("sha256").update(sql).digest("hex");
      const prior = (
        await client.query(
          "SELECT sha256 FROM public.kt_schema_migrations WHERE name=$1",
          [name],
        )
      ).rows[0];
      if (prior) {
        if (prior.sha256 !== hash)
          throw new Error(`Migration checksum changed: ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.kt_schema_migrations(name,sha256) VALUES($1,$2)",
          [name, hash],
        );
        await client.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727411302)");
    client.release();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  migrate()
    .finally(closeDatabases)
    .catch((e) => {
      console.error("Migration failed:", e.message);
      process.exitCode = 1;
    });
