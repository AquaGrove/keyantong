import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { transaction } from "../db/pool";
function client() {
  const endpoint = process.env.S3_ENDPOINT,
    accessKeyId = process.env.S3_ACCESS_KEY_ID,
    secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey)
    throw new Error("Object storage not configured");
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}
// Actor IDs are supplied by server-side currentUser(), never request body ownership fields.
export async function prepareUpload(
  actorId: string,
  input: { mediaType: string; size: number; sha256: string },
) {
  if (
    !Number.isSafeInteger(input.size) ||
    input.size < 0 ||
    input.size > 100 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !/^[\w.+-]+\/[\w.+-]+$/.test(input.mediaType)
  )
    throw new Error("Invalid object metadata");
  const id = randomUUID(),
    key = `users/${createOwnerKey(actorId)}/${id}`,
    bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET not configured");
  const checksum = Buffer.from(input.sha256, "hex").toString("base64");
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: input.mediaType,
      ContentLength: input.size,
      ChecksumSHA256: checksum,
    }),
    {
      expiresIn: 300,
      unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
      signableHeaders: new Set(["content-type"]),
    },
  );
  await transaction(
    "app",
    (c) =>
      c.query(
        "INSERT INTO kt_storage.objects(id,owner_id,bucket,object_key,media_type,size_bytes,sha256,state) VALUES($1,$2,$3,$4,$5,$6,$7,'pending')",
        [id, actorId, bucket, key, input.mediaType, input.size, input.sha256],
      ),
    actorId,
  );
  return {
    id,
    url,
    headers: {
      "Content-Type": input.mediaType,
      "x-amz-checksum-sha256": checksum,
    },
    expiresIn: 300,
  };
}
import { createHash } from "node:crypto";
function createOwnerKey(id: string) {
  return createHash("sha256").update(id).digest("hex");
}
export async function completeUpload(actorId: string, id: string) {
  return transaction(
    "app",
    async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM kt_storage.objects WHERE id=$1 AND state='pending' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row) throw new Error("Object not found");
      const head = await client().send(
        new HeadObjectCommand({
          Bucket: row.bucket,
          Key: row.object_key,
          ChecksumMode: "ENABLED",
        }),
      );
      if (
        head.ContentLength !== Number(row.size_bytes) ||
        head.ContentType !== row.media_type ||
        head.ChecksumSHA256 !==
          Buffer.from(row.sha256, "hex").toString("base64")
      )
        throw new Error("Uploaded object checksum or size mismatch");
      await c.query(
        "UPDATE kt_storage.objects SET state='ready',object_version=$2 WHERE id=$1",
        [id, head.VersionId || null],
      );
      return { id };
    },
    actorId,
  );
}
export async function downloadUrl(actorId: string, id: string) {
  const row = await transaction(
    "app",
    async (c) =>
      (
        await c.query(
          "SELECT * FROM kt_storage.objects WHERE id=$1 AND state='ready'",
          [id],
        )
      ).rows[0],
    actorId,
  );
  if (!row) throw new Error("Object not found");
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: row.bucket,
      Key: row.object_key,
      VersionId: row.object_version || undefined,
    }),
    { expiresIn: 60 },
  );
}

// Server-side ingestion; client names never become object keys.
export async function storePrivateObject(
  actorId: string,
  data: Buffer,
  mediaType: string,
) {
  const id = randomUUID(),
    bucket = process.env.S3_BUCKET,
    key = `users/${createOwnerKey(actorId)}/inputs/${id}`;
  if (!bucket || data.length > 12 * 1024 * 1024)
    throw new Error("文件过大或存储未配置");
  const sha256 = createHash("sha256").update(data).digest("hex");
  const uploaded = await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: mediaType,
      ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
    }),
  );
  const head = await client().send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
      VersionId: uploaded.VersionId,
      ChecksumMode: "ENABLED",
    }),
  );
  if (
    head.ContentLength !== data.length ||
    head.ChecksumSHA256 !== Buffer.from(sha256, "hex").toString("base64")
  )
    throw new Error("上传完整性校验失败");
  await transaction(
    "app",
    (c) =>
      c.query(
        "INSERT INTO kt_storage.objects(id,owner_id,bucket,object_key,object_version,media_type,size_bytes,sha256,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ready')",
        [
          id,
          actorId,
          bucket,
          key,
          uploaded.VersionId || null,
          mediaType,
          data.length,
          sha256,
        ],
      ),
    actorId,
  );
  return id;
}
