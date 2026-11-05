import { NextResponse } from "next/server";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import type { NcbiPayload } from "@/lib/tools/ncbi-validate";
import { assertNcbiJsonRequest, buildLocalPack } from "@/lib/tools/ncbi-local-pack";
import { getNcbiJob, listNcbiJobs, quotaForUser } from "@/lib/tools/ncbi-jobs";
import { clientIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * NCBI assist — local-upload architecture:
 * Portal NEVER accepts FASTQ bodies and NEVER runs ascp against user data on the server.
 * POST returns a local command pack / helper script for the researcher to run on their machine.
 * Legacy job GET kept for history only; new posts do not enqueue server-side ascp.
 */

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (id) {
    const job = getNcbiJob(id, user.id);
    if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    return NextResponse.json({
      job,
      quota: quotaForUser(user.id),
      note: "历史任务只读。新上传请使用本地助手；服务器不再执行 ascp。",
    });
  }
  return NextResponse.json({
    jobs: listNcbiJobs(user.id, 20),
    quota: quotaForUser(user.id),
    architecture: "local_only",
  });
}

export async function POST(request: Request) {
  const blocked = assertNcbiJsonRequest(request);
  if (blocked) return blocked;

  const ip = clientIp(request);
  const rl = rateLimit(`ncbi:run:${ip}`, { windowMs: 60_000, max: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }

  let body: NcbiPayload & { mode?: string; execute_on_server?: boolean };
  try {
    body = (await request.json()) as NcbiPayload & { mode?: string; execute_on_server?: boolean };
  } catch {
    return NextResponse.json({ error: "JSON 无效" }, { status: 400 });
  }

  if (body?.ascp && typeof (body.ascp as { key_content?: string }).key_content === "string") {
    return NextResponse.json({ error: "禁止上传密钥内容，请只填本机绝对路径" }, { status: 400 });
  }

  // Explicitly refuse any attempt to run ascp on the portal host.
  if (body.execute_on_server) {
    return NextResponse.json(
      {
        error:
          "已禁用服务器端 ascp。测序数据必须在用户本机直连 NCBI，请下载本地助手脚本或复制 ascp 命令。",
        code: "SERVER_ASCP_DISABLED",
        architecture: "local_only",
      },
      { status: 403 },
    );
  }

  const mode = ((body.mode || "dry-run").toLowerCase() === "run" ? "run" : "dry-run") as
    | "dry-run"
    | "run";
  const pack = buildLocalPack(body, mode);
  return NextResponse.json(
    {
      ...pack,
      message:
        mode === "dry-run"
          ? "已生成本地 dry-run 助手包（服务器未读取你的测序文件，也未执行 ascp）"
          : "已生成本地实际上传助手包（请在你的电脑执行；服务器不中转文件）",
      quota: quotaForUser(user.id),
    },
    { status: pack.ok ? 200 : 400 },
  );
}
