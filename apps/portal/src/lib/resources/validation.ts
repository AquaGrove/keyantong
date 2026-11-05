import type { ResourceContent, ResourceKind } from "./types";
export function safeResourceUrl(raw: unknown) {
  if (typeof raw !== "string" || raw.length > 1500)
    throw new Error("请填写 HTTPS 官方网址");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("网址格式不正确");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    !u.hostname.includes(".") ||
    /(^|\.)(localhost|local|internal|test|example|invalid)$/.test(u.hostname) ||
    /^[\d.]+$/.test(u.hostname) ||
    u.hostname.includes(":")
  )
    throw new Error("只接受公开 HTTPS 网站，不能包含账号、端口或内网地址");
  u.hash = "";
  return u.toString();
}
export function resourceInput(body: Record<string, unknown>) {
  if (!["genome", "tool"].includes(String(body.kind)))
    throw new Error("请选择资源类型");
  const c = body.content as Record<string, unknown>;
  if (!c || typeof c !== "object") throw new Error("请填写资源说明");
  const out: Record<string, string> = {};
  for (const [key, max] of Object.entries({
    name: 100,
    summary: 500,
    category: 60,
    species: 100,
    latinName: 150,
    icon: 30,
    provider: 150,
    inputs: 800,
    outputs: 800,
    instructions: 2500,
    access: 300,
    license: 300,
    assembly: 150,
    sourceUrl: 1500,
  })) {
    if (c[key] !== undefined && typeof c[key] !== "string")
      throw new Error("资源字段必须为文本");
    const value = String(c[key] || "").trim();
    if (value.length > max) throw new Error(`字段过长：${key}`);
    out[key] = value;
  }
  for (const key of [
    "name",
    "summary",
    "category",
    "provider",
    "inputs",
    "outputs",
    "instructions",
    "access",
    "license",
  ])
    if (
      out[key].length < (key === "instructions" ? 20 : key === "name" ? 1 : 2)
    )
      throw new Error(
        "请完整填写名称、用途、来源、输入输出、使用步骤、访问要求和许可说明（步骤至少 20 字）",
      );
  if (body.kind === "genome" && (!out.species || !out.latinName))
    throw new Error("基因组资源须填写物种中文名和拉丁名");
  out.sourceUrl = safeResourceUrl(out.sourceUrl);
  return {
    kind: body.kind as ResourceKind,
    url: safeResourceUrl(body.url),
    content: out as ResourceContent,
  };
}
