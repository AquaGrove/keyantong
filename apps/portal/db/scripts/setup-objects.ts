// Administrative one-shot, administrator credential is never passed to portal runtime.
import fs from "node:fs/promises";
import {
  S3Client,
  CreateBucketCommand,
  PutBucketVersioningCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
async function main() {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  for (const bucket of ["keyantong-private", "keyantong-validation"]) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (e: any) {
      if (e.$metadata?.httpStatusCode !== 404) throw e;
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    await s3.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
  }
  console.log("Private versioned buckets ready");
}
main().catch(() => {
  console.error("Object store setup failed");
  process.exitCode = 1;
});
