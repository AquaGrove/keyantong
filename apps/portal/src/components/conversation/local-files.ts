const channel = "keyantong-local-files-v1";
const maxBytes = 80 * 1024 * 1024;

// File extensions mark the end of an unquoted path in a chat sentence.
const pathPattern = /(?:(?<![a-z0-9_])[a-z]:[\\/](?![\\/])|\\\\|~\/|(?<![\w:/])\/(?!\/))[^\n"'“”<>|`，。；！？、]*?\.(?:csv|tsv|json)(?![a-z0-9_.\\/])/giu;
export const assistantDownload = "/downloads/keyantong-ncbi-assistant-preview.zip";

export function localPaths(text: string): string[] {
  return [...new Set(text.match(pathPattern) || [])].slice(0, 8);
}

export function redactLocalPaths(text: string): string {
  return text.replace(pathPattern, path => path.split(/[\\/]/).at(-1) || "本机文件");
}

export function fileNameReference(text: string) {
  const value = text.trim().replace(/[。！.!]+$/, "").trim();
  const candidate = value.match(/(?:文件名|文件路径|路径|文件|矩阵)\s*[:：]\s*(.+)$/)?.[1] || value;
  const name = candidate.replace(/^["“`]|["”`]$/g, "");
  return /^[^/\\<>:"|?*\r\n，。；！？、：]{1,180}\.(?:csv|tsv|json)$/i.test(name) ? name : undefined;
}

export function readLocalFile(path: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const chunks: BlobPart[] = [];
    let expected = 0;
    let received = 0;
    let name = "";
    let timer: ReturnType<typeof setTimeout>;
    const fail = (error: string) => {
      cleanup();
      reject(new Error(error));
    };
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
    function onMessage(event: MessageEvent) {
      const message = event.data;
      if (event.source !== window || event.origin !== location.origin ||
          message?.channel !== channel || message.type !== "result" || message.id !== id) return;
      const result = message.result;
      if (!result || typeof result !== "object") return;
      clearTimeout(timer);
      timer = setTimeout(() => fail("本机读取超时，请重试。"), 120000);
      if (result.ok === false) return fail(result.error || "读取失败。");
      if (result.kind === "start") {
        if (name || !Number.isSafeInteger(result.size) || result.size <= 0 || result.size > maxBytes ||
            typeof result.name !== "string" || !/\.(csv|tsv|json)$/i.test(result.name))
          return fail("本机助手返回的文件信息无效。");
        name = result.name;
        expected = result.size;
      } else if (result.kind === "chunk") {
        try {
          if (!name || typeof result.bytes !== "string" || result.bytes.length > 524288)
            return fail("本机助手返回的文件分片无效。");
          const bytes = Uint8Array.from(atob(result.bytes), character => character.charCodeAt(0));
          received += bytes.length;
          if (received > expected) return fail("文件大小发生变化，请重新读取。");
          chunks.push(bytes);
        } catch {
          fail("无法读取本机文件分片。");
        }
      } else if (result.kind === "done") {
        if (!name || received !== expected) return fail("文件读取不完整，请重试。");
        cleanup();
        resolve(new File(chunks, name));
      }
    }
    window.addEventListener("message", onMessage);
    timer = setTimeout(() => fail("当前浏览器尚未连接科研通本机助手。可以安装或更新助手后重发路径，也可以点输入框旁的「选文件」。"), 1500);
    window.postMessage({ channel, type: "read", id, path }, location.origin);
  });
}

export function localOperation<T>(
  type: "scan" | "prepare" | "start" | "status",
  options: { path?: string; request?: Record<string, unknown> },
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: string, data?: T) => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      if (error) reject(new Error(error));
      else resolve(data as T);
    };
    function receive(event: MessageEvent) {
      const msg = event.data;
      if (event.source !== window || event.origin !== location.origin ||
          msg?.channel !== channel || msg.type !== "result" || msg.id !== id) return;
      const result = msg.result;
      if (result?.kind === "connected") {
        clearTimeout(timer);
        timer = setTimeout(() => finish("本机操作超时，请稍后查看状态。"), type === "prepare" ? 900000 : 120000);
      } else if (result?.ok === true) {
        finish(undefined, result.data);
      } else if (result?.ok === false) {
        finish(result.error || "本机操作失败。");
      }
    }
    window.addEventListener("message", receive);
    timer = setTimeout(() => finish("当前浏览器尚未连接科研通本机助手。更新助手后重试，也可以先把文件夹拖到聊天框核对清单。"), 1500);
    window.postMessage({ channel, type, id, ...options }, location.origin);
  });
}
