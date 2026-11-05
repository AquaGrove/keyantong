import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, statfs } from "node:fs/promises";
import path from "node:path";
import { transaction } from "../db/pool";

export const partSize = 8 * 1024 * 1024;
export const batchLimit = 2 * 1024 ** 3;
export const relayRoot = () => process.env.NCBI_RELAY_ROOT;
const namePattern = /^[a-z0-9][a-z0-9._-]{0,175}\.(?:fastq|fq)(?:\.gz)?$/i;

type RelayFile = { name: string; size: number; hashes: string[] };
type Batch = { id: string; files: RelayFile[]; expires_at: Date; total_bytes: string };
export class RelayError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function publicBatch(batch: Batch) {
  return {
    id: batch.id,
    expiresAt: batch.expires_at,
    totalBytes: Number(batch.total_bytes),
    files: batch.files,
    complete: batch.files.every(file => file.hashes.length === Math.ceil(file.size / partSize)),
  };
}

export function relayBatch(owner: string, task: string, input?: unknown) {
  let requested: RelayFile[] | undefined;
  if (input !== undefined) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 100)
      throw new RelayError("每批请选择 1 至 100 个 FASTQ 文件。");
    requested = input.map(item => {
      if (typeof item?.name !== "string" || !namePattern.test(item.name) ||
          !Number.isSafeInteger(item.size) || item.size <= 0 || item.size > batchLimit)
        throw new RelayError("请使用英文或数字开头的 FASTQ 文件名，单文件不能超过 2 GiB。");
      return { name: item.name, size: item.size, hashes: [] };
    });
    if (new Set(requested.map(file => file.name.toLowerCase())).size !== requested.length)
      throw new RelayError("本批有重复文件名。");
  }
  return transaction("app", async db => {
    if (requested) {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 91))", [owner]);
      const parent = await db.query("SELECT 1 FROM kt_ops.conversation_history WHERE owner_id=$1 AND id=$2", [owner, task]);
      if (!parent.rowCount) throw new RelayError("找不到当前任务。", 404);
    }
    const existing = (await db.query<Batch>(
      "SELECT id,files,expires_at,total_bytes FROM kt_ops.ncbi_relay_batches WHERE owner_id=$1 AND task_id=$2",
      [owner, task],
    )).rows[0];
    if (existing && existing.expires_at.getTime() > Date.now()) {
      if (requested && (requested.length !== existing.files.length || requested.some((file, index) =>
        file.name !== existing.files[index].name || file.size !== existing.files[index].size)))
        throw new RelayError("当前任务已有另一批文件。请重新选入原批次文件，或新建任务。", 409);
      return publicBatch(existing);
    }
    if (!requested) throw new RelayError("当前任务没有有效的暂存批次。", 404);
    const total = requested.reduce((sum, file) => sum + file.size, 0);
    const active = (await db.query(
      "SELECT COALESCE(sum(total_bytes),0) AS bytes FROM kt_ops.ncbi_relay_batches WHERE owner_id=$1 AND expires_at > now()",
      [owner],
    )).rows[0];
    if (total + Number(active.bytes) > batchLimit)
      throw new RelayError("当前账号的暂存额度为 2 GiB，暂存 24 小时。", 409);
    const root = relayRoot()!;
    await mkdir(root, { recursive: true, mode: 0o700 });
    const free = await statfs(root);
    if (free.bavail * free.bsize < 20 * 1024 ** 3 + total)
      throw new RelayError("暂存空间不足，请稍后重试。", 503);
    const result = await db.query<Batch>(`
      INSERT INTO kt_ops.ncbi_relay_batches(owner_id,task_id,id,files,total_bytes)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT (owner_id,task_id) DO UPDATE
      SET id=EXCLUDED.id,files=EXCLUDED.files,total_bytes=EXCLUDED.total_bytes,expires_at=EXCLUDED.expires_at
      RETURNING id,files,expires_at,total_bytes`, [owner, task, randomUUID(), JSON.stringify(requested), total]);
    return publicBatch(result.rows[0]);
  }, owner);
}

export function writeRelayPart(owner: string, task: string, batchId: string, index: number, part: number, body: Buffer, hash: string) {
  if (createHash("sha256").update(body).digest("hex") !== hash)
    throw new RelayError("分片校验失败，请重试。");
  return transaction("app", async db => {
    const batch = (await db.query<Batch>(`
      SELECT id,files,expires_at,total_bytes FROM kt_ops.ncbi_relay_batches
      WHERE owner_id=$1 AND task_id=$2 AND id=$3 AND expires_at > now() FOR UPDATE`, [owner, task, batchId])).rows[0];
    const file = batch?.files[index];
    if (!file) throw new RelayError("批次或文件不存在。", 404);
    if (part < file.hashes.length) {
      if (file.hashes[part] !== hash) throw new RelayError("文件与已上传的分片不同。", 409);
      return;
    }
    const length = Math.min(partSize, file.size - part * partSize);
    if (part !== file.hashes.length || length <= 0 || body.length !== length)
      throw new RelayError("分片位置或长度不匹配。", 409);
    await db.query("SELECT pg_advisory_xact_lock(991320)");
    const root = relayRoot()!;
    const free = await statfs(root);
    if (free.bavail * free.bsize < 20 * 1024 ** 3 + body.length)
      throw new RelayError("暂存空间不足，请稍后继续。", 503);
    const directory = path.join(root, batch.id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const destination = path.join(directory, String(index));
    const handle = part === 0
      ? await open(destination, "w", 0o600)
      : await open(destination, "r+");
    try {
      const offset = part * partSize;
      if ((await handle.stat()).size < offset) throw new RelayError("暂存文件不完整，请新建任务重传。", 409);
      await handle.truncate(offset);
      let written = 0;
      while (written < body.length) {
        const { bytesWritten } = await handle.write(body, written, body.length - written, offset + written);
        if (!bytesWritten) throw new Error("Unable to write relay part");
        written += bytesWritten;
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    file.hashes.push(hash);
    await db.query("UPDATE kt_ops.ncbi_relay_batches SET files=$3 WHERE owner_id=$1 AND task_id=$2",
      [owner, task, JSON.stringify(batch.files)]);
  }, owner);
}
