import rows from "../../../../catalog/resources/curated.json";
import { transaction, closeDatabases } from "../../src/lib/db/pool";
import { resourceInput } from "../../src/lib/resources/validation";
async function main() {
  await transaction("migration", async (c) => {
    for (const r of rows) {
      resourceInput(r);
      await c.query(
        "INSERT INTO kt_catalog.resources(id,kind,url,content,status,reviewed_by,review_note,reviewed_at) VALUES($1,$2,$3,$4,'published','curated-import','官方来源目录初始整理；访问条款及组装版本请以来源网站说明为准',now()) ON CONFLICT(id) DO NOTHING",
        [r.id, r.kind, r.url, r.content],
      );
    }
  });
  console.log(`Seeded ${rows.length} curated resources`);
}
main()
  .finally(closeDatabases)
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
