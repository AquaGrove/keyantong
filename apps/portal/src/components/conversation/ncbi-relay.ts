const partSize = 8 * 1024 * 1024;

export type RelayBatch = {
  id: string;
  expiresAt: string;
  totalBytes: number;
  files: { name: string; size: number; hashes: string[] }[];
  complete: boolean;
};

export async function relayRequest<T>(url: string, actor: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("x-keyantong-actor", actor);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "上传中断，请保留原文件并继续。");
  return result as T;
}

export async function stageFastq(
  taskId: string, actor: string, files: File[], onProgress: (sent: number, total: number) => void,
) {
  const url = "/api/ncbi/relay/" + taskId;
  const ordered = files.slice().sort((a, b) => a.name.localeCompare(b.name, "en"));
  const batch = await relayRequest<RelayBatch>(url, actor, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ordered.map(({name, size}) => ({name, size}))),
  });
  let sent = 0;
  for (const [index, file] of ordered.entries()) {
    for (let offset = 0, part = 0; offset < file.size; offset += partSize, part++) {
      const bytes = await file.slice(offset, offset + partSize).arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        byte => byte.toString(16).padStart(2, "0")).join("");
      const saved = batch.files[index].hashes[part];
      if (saved && saved !== hash) throw new Error("所选文件内容与已暂存的分片不同，请重新选入原文件。");
      if (!saved) {
        const query = new URLSearchParams({ batch: batch.id, file: String(index), part: String(part) });
        await relayRequest(url + "?" + query, actor, {
          method: "PUT",
          headers: { "content-type": "application/octet-stream", "x-part-sha256": hash },
          body: bytes,
        });
      }
      sent += bytes.byteLength;
      onProgress(sent, batch.totalBytes);
    }
  }
  return relayRequest<RelayBatch>(url, actor);
}
