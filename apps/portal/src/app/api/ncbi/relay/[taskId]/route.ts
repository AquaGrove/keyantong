import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { rateLimit } from "@/lib/security/rate-limit";
import { partSize, relayBatch, RelayError, relayRoot, writeRelayPart } from "@/lib/tools/ncbi-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let activeWrites = 0;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
type RouteContext = { params: Promise<{ taskId: string }> };

async function readBody(request: Request, maximum: number) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!reader) throw new RelayError("请求缺少内容。");
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 60000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (timedOut) throw new RelayError("分片读取超时，请继续暂存。", 408);
      if (done) break;
      size += value.length;
      if (size > maximum) {
        void reader.cancel().catch(() => {});
        throw new RelayError("请求内容超过大小限制。", 413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    clearTimeout(timer);
  }
}

async function handle(request: Request, context: RouteContext) {
  try {
    if (!relayRoot()) throw new RelayError("免安装暂存尚未开启。", 503);
    const user = await currentUser();
    if (!user) throw new RelayError("请先登录科研通。", 401);
    const { taskId } = await context.params;
    if (!uuid.test(taskId))
      throw new RelayError("任务编号无效。");
    if (request.method === "GET")
      return NextResponse.json(await relayBatch(user.id, taskId), { headers: { "Cache-Control": "no-store" } });
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new RelayError("请求来源不受支持。", 403);
    if (!rateLimit("ncbi-relay:" + user.id, { windowMs: 60000, max: 160 }).ok)
      throw new RelayError("请求过快，请稍后继续。", 429);
    if (request.method === "POST") {
      let manifest: unknown;
      try { manifest = JSON.parse((await readBody(request, 32 * 1024)).toString("utf8")); }
      catch (error) { if (error instanceof RelayError) throw error; throw new RelayError("文件清单格式无效。"); }
      if (!Array.isArray(manifest)) throw new RelayError("文件清单格式无效。");
      return NextResponse.json(await relayBatch(user.id, taskId, manifest));
    }
    const query = new URL(request.url).searchParams;
    const batchId = query.get("batch") || "";
    const index = query.get("file") || "";
    const part = query.get("part") || "";
    const hash = request.headers.get("x-part-sha256") || "";
    if (!uuid.test(batchId) || !/^\d{1,3}$/.test(index) || !/^\d{1,3}$/.test(part) || !/^[a-f0-9]{64}$/.test(hash))
      throw new RelayError("分片参数无效。");
    if (activeWrites >= 8) throw new RelayError("暂存服务繁忙，请稍后继续。", 503);
    activeWrites++;
    try {
      await writeRelayPart(user.id, taskId, batchId, Number(index), Number(part), await readBody(request, partSize), hash);
    } finally {
      activeWrites--;
    }
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof RelayError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[ncbi-relay] request failed", error instanceof Error ? error.name : "Unknown");
    return NextResponse.json({ error: "暂存服务暂时不可用，可保留原文件稍后继续。" }, { status: 503 });
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
