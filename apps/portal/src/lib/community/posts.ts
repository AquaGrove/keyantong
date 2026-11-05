import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDir } from "@/lib/tools/job-store";
import {
  sanitizeMultiline,
  sanitizePlainText,
  looksLikePiracySolicitation,
  maskEmail,
  validatePublicHttpUrl,
} from "@/lib/security";

import { POST_KINDS, type PostKind, type Post, type PublicPost } from "./types";
export type { PublicPost } from "./types";
class CommunityError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function file() {
  return path.join(resolveDataDir(), "research-community.json");
}
function read(): Post[] {
  try {
    const data = JSON.parse(fs.readFileSync(file(), "utf8"));
    if (!Array.isArray(data.posts)) throw new Error();
    return data.posts;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new CommunityError("社区数据暂时无法读取，请稍后重试", 503);
  }
}
function write(posts: Post[]) {
  const dest = file();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, posts }), { mode: 0o600 });
  fs.renameSync(tmp, dest);
}
function publicPost(p: Post, viewer?: string, detail = false): PublicPost {
  const { authorId, responses, ...rest } = p;
  return {
    ...rest,
    isOwner: authorId === viewer,
    responseCount: responses.length,
    responses: detail ? responses.map(({ authorId: _id, ...r }) => r) : [],
  };
}
export function listResearchPosts(
  opts: {
    kind?: string;
    q?: string;
    status?: string;
    page?: number;
    limit?: number;
    viewer?: string;
  } = {},
) {
  const q = (opts.q || "").trim().toLowerCase().slice(0, 120);
  const posts = read().filter(
    (p) =>
      (!opts.kind || opts.kind === "all" || p.kind === opts.kind) &&
      (!q ||
        `${p.title} ${p.body} ${p.doi} ${p.topic}`.toLowerCase().includes(q)) &&
      (opts.status !== "open" || !p.acceptedResponseId),
  );
  const limit = Math.max(1, Math.min(30, Number(opts.limit) || 12));
  const pages = Math.max(1, Math.ceil(posts.length / limit));
  const page = Math.max(1, Math.min(pages, Number(opts.page) || 1));
  return {
    posts: posts
      .slice((page - 1) * limit, page * limit)
      .map((p) => publicPost(p, opts.viewer)),
    total: posts.length,
    page,
    pages,
  };
}
export function getResearchPost(id: string, viewer?: string) {
  const p = read().find((p) => p.id === id);
  return p ? publicPost(p, viewer, true) : null;
}
function text(raw: unknown, max: number, multiline = false) {
  if (typeof raw !== "string" || raw.length > max)
    throw new CommunityError(`内容须为 ${max} 字以内的文本`);
  return multiline ? sanitizeMultiline(raw, max) : sanitizePlainText(raw, max);
}
function cleanContent(raw: unknown, max: number) {
  const value = text(raw, max, true);
  if (!value) throw new CommunityError("请填写正文");
  if (looksLikePiracySolicitation(value))
    throw new CommunityError("请分享开放获取、馆藏或作者稿等合法获取路径");
  return value;
}
export function createResearchPost(
  raw: Record<string, unknown>,
  user: { id: string; email: string },
  idempotencyId?: string,
) {
  if (typeof raw.kind !== "string" || !Object.hasOwn(POST_KINDS, raw.kind))
    throw new CommunityError("请选择有效的动态分类");
  const title = text(raw.title, 120);
  if (title.length < 3) throw new CommunityError("标题至少 3 个字");
  const body = cleanContent(raw.body, 6000);
  if (looksLikePiracySolicitation(title))
    throw new CommunityError("请使用合法文献获取路径");
  const post: Post = {
    id: idempotencyId || randomUUID(),
    kind: raw.kind as PostKind,
    title,
    body,
    doi: text(raw.doi ?? "", 300),
    topic: text(raw.topic ?? "", 60),
    authorId: user.id,
    authorLabel: maskEmail(user.email),
    createdAt: new Date().toISOString(),
    responses: [],
    acceptedResponseId: null,
  };
  const posts = read();
  const existing=posts.find(p=>p.id===idempotencyId&&p.authorId===user.id);
  if(existing)return publicPost(existing,user.id,true);
  if (posts.length >= 10000)
    throw new CommunityError("社区容量暂满，请联系站务", 503);
  posts.unshift(post);
  write(posts);
  return publicPost(post, user.id, true);
}
export function respondToPost(
  id: string,
  raw: Record<string, unknown>,
  user: { id: string; email: string },
  idempotencyId?: string,
) {
  const posts = read();
  const post = posts.find((p) => p.id === id);
  if (!post) throw new CommunityError("动态不存在", 404);
  if(idempotencyId&&post.responses.some(r=>r.id===idempotencyId&&r.authorId===user.id))return publicPost(post,user.id,true);
  const body = cleanContent(raw.body, 4000);
  let url: string | null = null;
  if (raw.url) {
    const check = validatePublicHttpUrl(text(raw.url, 2000));
    if (!check.ok) throw new CommunityError(check.error);
    url = check.href;
  }
  if (post.responses.length >= 200)
    throw new CommunityError("该动态已达到回复上限");
  post.responses.push({
    id: idempotencyId || randomUUID(),
    authorId: user.id,
    authorLabel: maskEmail(user.email),
    body,
    url,
    createdAt: new Date().toISOString(),
  });
  write(posts);
  return publicPost(post, user.id, true);
}
export function acceptResponse(
  id: string,
  responseId: unknown,
  userId: string,
) {
  const posts = read();
  const post = posts.find((p) => p.id === id);
  if (!post) throw new CommunityError("动态不存在", 404);
  if (post.authorId !== userId)
    throw new CommunityError("只有发起人可以采纳回复", 403);
  if (responseId !== null && !post.responses.some((r) => r.id === responseId))
    throw new CommunityError("回复不存在", 404);
  post.acceptedResponseId = responseId as string | null;
  write(posts);
  return publicPost(post, userId, true);
}
export function communityError(e: unknown) {
  return e instanceof CommunityError
    ? { error: e.message, status: e.status }
    : { error: "社区服务暂时不可用，请稍后重试", status: 503 };
}
