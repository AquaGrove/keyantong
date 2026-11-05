// A rollback must export CURRENT database identities, never reuse the pre-cutover JSON.
import fs from "node:fs/promises";
import { allUsers } from "../../src/lib/auth/postgres";
import { closeDatabases } from "../../src/lib/db/pool";
async function main() {
  const target = process.argv[2];
  if (!target) throw new Error("Provide a NEW output file");
  const users = await allUsers();
  await fs.writeFile(target, JSON.stringify({ users, codes: [] }, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      users: users.length,
      codes: 0,
      notice: "Verification codes and sessions are invalidated on rollback",
    }),
  );
}
main()
  .finally(closeDatabases)
  .catch((e) => {
    console.error("Export failed:", e.message);
    process.exitCode = 1;
  });
