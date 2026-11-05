import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dbPool, closeDatabases, transaction } from "../../src/lib/db/pool";
import {
  registerUserWithCode,
  verifyRegistration,
} from "../../src/lib/auth/postgres";
import {
  submitResource,
  listResources,
  myResources,
  reviewResource,
} from "../../src/lib/resources/store";
import { safeResourceUrl } from "../../src/lib/resources/validation";
import { createAnalysis, analysisJobs } from "../../src/lib/analysis/jobs";
import fs from "node:fs/promises";
async function main() {
  if (
    !new URL(process.env.DATABASE_MIGRATION_URL!).pathname.endsWith(
      "_validation",
    )
  )
    throw new Error("Validation DB only");
  let checks = 0;
  const suffix = randomUUID();
  async function user(prefix: string) {
    const email = `${prefix}-${suffix}@example.edu`;
    await registerUserWithCode(email, "synthetic-test-hash", {
      email,
      purpose: "register",
      code: "123456",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    return verifyRegistration(email, "123456");
  }
  const a = await user("resource-a"),
    b = await user("resource-b");
  for (const u of [
    "http://example.org",
    "https://localhost",
    "https://127.0.0.1",
    "https://a:b@example.org",
    "javascript:alert(1)",
  ])
    assert.throws(() => safeResourceUrl(u));
  checks++;
  const content = {
    name: "Synthetic test resource",
    summary: "Synthetic test resource for moderation isolation",
    category: "测试",
    provider: "Test fixture",
    inputs: "输入序列",
    outputs: "输出注释",
    instructions:
      "这是独立测试库中的合成资源，核对审核与公开流程，不是真实科研网站。",
    access: "公开访问",
    license: "测试数据",
    sourceUrl: "https://www.ncbi.nlm.nih.gov/",
  };
  const r = await submitResource(a.id, {
    kind: "tool",
    url: `https://www.ncbi.nlm.nih.gov/?kt-test=${suffix}`,
    content,
  });
  assert.equal(r.status, "pending");
  assert.ok(!(await listResources()).some((x) => x.id === r.id));
  checks++;
  assert.ok((await myResources(a.id)).some((x) => x.id === r.id));
  assert.ok(!(await myResources(b.id)).some((x) => x.id === r.id));
  checks++;
  await assert.rejects(
    transaction(
      "app",
      (c) =>
        c.query(
          "UPDATE kt_catalog.resources SET status='published' WHERE id=$1",
          [r.id],
        ),
      a.id,
    ),
  );
  checks++;
  await assert.rejects(
    reviewResource(r.id, 1, "published", "测试审核说明已经足够长", false),
  );
  checks++;
  await reviewResource(
    r.id,
    1,
    "published",
    "已核对测试资料和许可，允许测试发布",
    true,
  );
  assert.ok((await listResources()).some((x) => x.id === r.id));
  checks++;
  await assert.rejects(
    reviewResource(r.id, 1, "rejected", "旧版本不能覆盖新的审核决定", false),
  );
  checks++;
  await reviewResource(
    r.id,
    2,
    "withdrawn",
    "测试完成后下架合成资源以验证状态变化",
    false,
  );
  assert.ok(!(await listResources()).some((x) => x.id === r.id));
  checks++;
  const root = process.env.OMICS_FIXTURES || "/fixtures";
  const counts = await fs.readFile(root + "/counts.csv");
  const job = await createAnalysis(
    a.id,
    "bsa.delta.v1",
    { minDepth: 10, windowBp: 1000000 },
    { "counts.csv": counts },
  );
  assert.equal(
    (
      await createAnalysis(
        a.id,
        "bsa.delta.v1",
        { minDepth: 10, windowBp: 1000000 },
        { "counts.csv": counts },
      )
    ).id,
    job.id,
  );
  checks++;
  assert.equal((await analysisJobs(b.id, job.id)).length, 0);
  checks++;
  await assert.rejects(
    createAnalysis(
      a.id,
      "gwas.plink-linear.v1",
      { ploidy: 4 },
      { "genotypes.csv": counts, "phenotypes.csv": counts },
    ),
  );
  checks++;
  const genotype = await fs.readFile(root + "/genotypes.csv"),
    phenotype = await fs.readFile(root + "/phenotypes.csv");
  const gwas = await createAnalysis(
    b.id,
    "gwas.plink-linear.v1",
    { maf: 0.05, pcs: 2, ploidy: 2 },
    { "genotypes.csv": genotype, "phenotypes.csv": phenotype },
  );
  console.log(
    JSON.stringify({
      ok: true,
      checks,
      bsaJob: job.id,
      gwasJob: gwas.id,
      owners: [a.id, b.id],
    }),
  );
}
main()
  .finally(closeDatabases)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
