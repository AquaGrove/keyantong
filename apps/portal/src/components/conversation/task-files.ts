import type { Attachment } from "./provider";
import type { UploadDraft } from "./sequencing";

export type LocalTaskData = {
  files: Attachment[];
  upload: UploadDraft | null;
  waitingForFolder: boolean;
  transferId: string | null;
};

export async function taskFiles(owner: string, id: string, data?: LocalTaskData): Promise<LocalTaskData | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("keyantong-task-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<LocalTaskData | undefined>((resolve, reject) => {
      const transaction = db.transaction("files", data ? "readwrite" : "readonly");
      const store = transaction.objectStore("files");
      const key = owner + ":" + id;
      const request = data ? store.put(data, key) : store.get(key);
      transaction.oncomplete = () => {
        const saved = data || request.result;
        resolve(Array.isArray(saved) ? { files: saved, upload: null, waitingForFolder: false, transferId: null } : saved);
      };
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
