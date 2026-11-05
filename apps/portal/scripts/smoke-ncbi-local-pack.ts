/**
 * Smoke: NCBI local-pack architecture — no FASTQ bodies, pack generates command/script.
 * Run: cd apps/portal && npx --yes tsx scripts/smoke-ncbi-local-pack.ts
 */
import assert from "node:assert/strict";
import {
  NCBI_MAX_JSON_BYTES,
  assertNcbiJsonRequest,
  buildLocalPack,
} from "../src/lib/tools/ncbi-local-pack";

const base = {
  bioproject: {
    title: "Potato RNAseq demo",
    description: "Demo local pack",
    data_type: "transcriptome",
  },
  biosample: {
    sample_name: "Leaf_T1",
    organism: "Solanum tuberosum",
    isolate_or_breed: "Desiree",
    collection_date: "2024-06-01",
  },
  library: {
    library_strategy: "RNA-Seq",
    library_source: "TRANSCRIPTOMIC",
    library_selection: "cDNA",
    library_layout: "paired",
  },
  files: [{ filename: "Leaf_T1_R1.fastq.gz" }, { filename: "Leaf_T1_R2.fastq.gz" }],
  ascp: {
    key_path: "/Users/nature/keys/aspera.openssh",
    local_folder: "/Users/nature/data/sra",
    ncbi_user_email: "user@example.edu",
    account_folder: "example.edu.folder",
  },
};

const pack = buildLocalPack(base, "dry-run");
assert.equal(pack.ok, true);
assert.equal(pack.architecture, "local_only");
assert.equal(pack.server_executes_ascp, false);
assert.equal(pack.never_upload_fastq_to_portal, true);
assert.ok(pack.ascp_command?.includes("ascp"));
assert.ok(pack.ascp_command?.includes("/Users/nature/data/sra"));
assert.ok(pack.helper_script?.includes("keyantong-ncbi-local-upload"));
assert.ok(pack.helper_script?.includes("永不经过科研通") || pack.helper_script?.includes("科研通"));
assert.ok(!pack.helper_script?.includes("PRIVATE KEY"));

const badKey = buildLocalPack(
  {
    ...base,
    ascp: { ...base.ascp, key_path: "relative/key" },
  },
  "run",
);
assert.equal(badKey.ok, false);

const multipart = assertNcbiJsonRequest(
  new Request("http://localhost/api/tools/ncbi-run", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
  }),
);
assert.ok(multipart);
assert.equal(multipart!.status, 415);

const huge = assertNcbiJsonRequest(
  new Request("http://localhost/api/tools/ncbi-run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(NCBI_MAX_JSON_BYTES + 10),
    },
  }),
);
assert.ok(huge);
assert.equal(huge!.status, 413);

const okReq = assertNcbiJsonRequest(
  new Request("http://localhost/api/tools/ncbi-run", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "1200" },
  }),
);
assert.equal(okReq, null);

console.log("smoke-ncbi-local-pack: OK");
