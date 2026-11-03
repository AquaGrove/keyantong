import { NextResponse } from "next/server";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import { validateNcbiPayload, type NcbiPayload } from "@/lib/tools/ncbi-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
  // Never accept or store private key material — only paths.
  if (body?.ascp && typeof (body.ascp as { key_content?: string }).key_content === "string") {
    return NextResponse.json({ error: "禁止上传密钥内容，请只填本机绝对路径" }, { status: 400 });
  }
  const result = validateNcbiPayload(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
