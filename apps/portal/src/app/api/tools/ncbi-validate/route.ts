import { NextResponse } from "next/server";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import { validateNcbiPayload, type NcbiPayload } from "@/lib/tools/ncbi-validate";
import { assertNcbiJsonRequest, stripSecrets } from "@/lib/tools/ncbi-local-pack";
import { clientIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = assertNcbiJsonRequest(request);
  if (blocked) return blocked;

  const ip = clientIp(request);
  const rl = rateLimit(`ncbi:validate:${ip}`, { windowMs: 60_000, max: 60 });
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
  let body: NcbiPayload;
  try {
    body = (await request.json()) as NcbiPayload;
  } catch {
    return NextResponse.json({ error: "JSON 无效" }, { status: 400 });
  }
  if (body?.ascp && typeof (body.ascp as { key_content?: string }).key_content === "string") {
    return NextResponse.json({ error: "禁止上传密钥内容，请只填本机绝对路径" }, { status: 400 });
  }
  const safe = stripSecrets(body);
  const result = validateNcbiPayload(safe);
  return NextResponse.json(
    {
      ...result,
      architecture: "local_only",
      never_upload_fastq_to_portal: true,
      note: "本接口只校验元数据与文件名清单，不接收、不存储测序文件内容。",
    },
    { status: result.ok ? 200 : 400 },
  );
}
