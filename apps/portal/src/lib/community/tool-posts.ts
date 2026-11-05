import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import seed from "./seed-tool-posts.json";
import {
  looksLikePiracySolicitation,
  maskEmail,
  sanitizeMultiline,
  sanitizePlainText,
  validatePublicHttpUrl,
} from "@/lib/security";
import { resolveDataDir, readJson, writeJson } from "@/lib/tools/job-store";

export type ToolPostType = "tool_share" | "tool_help";
export type ToolPostStatus = "open" | "resolved" | "archived";

export type ToolPost = {
  id: string;
  type: ToolPostType;
  title: string;
  description: string;
  downloadUrl: string | null;
  tags: string[];
  category: string | null;
  authorId: string;
  authorLabel: string;
  createdAt: string;
  updatedAt: string;
  status: ToolPostStatus;
  linkedShareId: string | null;
  tried?: string | null;
  expectedToolType?: string | null;
  searchText: string;
};

type StoreFile = { posts: ToolPost[]; version: number };

const LIMITS = {
  title: 120,
  description: 4000,
  tag: 32,
  tags: 12,
  category: 40,
  tried: 1000,
  expectedToolType: 80,
  url: 2000,
};

function storePath() {
  return path.join(resolveDataDir(), "community-posts.json");
}

function seedPosts(): ToolPost[] {
  return (seed as ToolPost[]).map((p) => ({ ...p }));
}

function emptyStore(): StoreFile {
  return { version: 1, posts: seedPosts() };
}

function readStore(): StoreFile {
  const p = storePath();
  const data = readJson<StoreFile>(p);
  if (!data || !Array.isArray(data.posts)) {
    const init = emptyStore();
    writeJson(p, init);
    return init;
  }
  if (data.posts.length === 0) {
    data.posts = seedPosts();
    writeJson(p, data);
  }
  return data;
}

function writeStore(data: StoreFile) {
  writeJson(storePath(), data);
}

function buildSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(raw: unknown): string[] {
  const list: string[] = [];
  if (Array.isArray(raw)) {
    for (const t of raw) list.push(String(t));
  } else if (typeof raw === "string") {
    list.push(...raw.split(/[,，、]/));
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    const clean = sanitizePlainText(t, LIMITS.tag).toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

export type PublicToolPost = Omit<ToolPost, "authorId"> & { authorId?: undefined };

export function toPublic(post: ToolPost): PublicToolPost {
  const { authorId: _a, ...rest } = post;
  return rest;
}

export type ListQuery = {
  q?: string;
  type?: ToolPostType | "all";
  tag?: string;
  status?: ToolPostStatus | "all";
  page?: number;
  pageSize?: number;
};

function tokenize(q: string): string[] {
  const lower = q.toLowerCase().trim();
  if (!lower) return [];
  const parts = lower.split(/[\s,，、;/|]+/).filter(Boolean);
  // also keep full string for substring match
  return Array.from(new Set([lower, ...parts]));
}

function matches(post: ToolPost, tokens: string[], tag?: string): boolean {
  if (tag) {
    const t = tag.toLowerCase();
    if (!post.tags.some((x) => x === t || x.includes(t))) return false;
  }
  if (tokens.length === 0) return true;
  const hay = post.searchText || buildSearchText([post.title, post.description, post.tags.join(" "), post.category]);
  // every token must appear (AND); short query often one token = full string
  return tokens.every((tok) => hay.includes(tok));
}

export function listToolPosts(query: ListQuery = {}) {
  const store = readStore();
  const type = query.type || "all";
  const status = query.status || "all";
  const tag = (query.tag || "").trim().toLowerCase() || undefined;
  const tokens = tokenize(query.q || "");
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20));

  let items = store.posts.filter((p) => {
    if (type !== "all" && p.type !== type) return false;
    if (status !== "all" && p.status !== status) return false;
    return matches(p, tokens, tag);
  });

  // help: open first; then newer
  items.sort((a, b) => {
    if (a.type === "tool_help" && b.type === "tool_help") {
      const ao = a.status === "open" ? 0 : 1;
      const bo = b.status === "open" ? 0 : 1;
      if (ao !== bo) return ao - bo;
    }
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  const total = items.length;
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize).map(toPublic);
  const suggestHelp = Boolean((query.q || "").trim()) && total === 0;

  return {
    items: pageItems,
    total,
    page,
    pageSize,
    suggestHelp,
  };
}

export function getToolPost(id: string): ToolPost | null {
  const store = readStore();
  return store.posts.find((p) => p.id === id) ?? null;
}

export type CreateShareInput = {
  type: "tool_share";
  title: string;
  description: string;
  downloadUrl: string;
  tags?: unknown;
  category?: string;
};

export type CreateHelpInput = {
  type: "tool_help";
  title: string;
  description: string;
  tags?: unknown;
  category?: string;
  tried?: string;
  expectedToolType?: string;
};

export type CreateInput = CreateShareInput | CreateHelpInput;

export type CreateResult =
  | { ok: true; post: PublicToolPost }
  | { ok: false; error: string; status: number };

export function createToolPost(
  input: CreateInput,
  author: { id: string; email: string },
): CreateResult {
  const title = sanitizePlainText(input.title, LIMITS.title);
  const description = sanitizeMultiline(input.description, LIMITS.description);
  if (title.length < 4) return { ok: false, error: "标题至少 4 个字符", status: 400 };
  if (description.length < 10) return { ok: false, error: "描述请再写详细一些", status: 400 };

  const blob = `${title}\n${description}`;
  if (looksLikePiracySolicitation(blob)) {
    return {
      ok: false,
      error: "内容疑似引导盗版文献/PDF 互传，已拒绝。请只分享合法授权的科研工具外链。",
      status: 400,
    };
  }

  const tags = normalizeTags(input.tags);
  const category = input.category
    ? sanitizePlainText(input.category, LIMITS.category) || null
    : null;

  let downloadUrl: string | null = null;
  let tried: string | null | undefined;
  let expectedToolType: string | null | undefined;

  if (input.type === "tool_share") {
    const checked = validatePublicHttpUrl(input.downloadUrl, { maxLen: LIMITS.url });
    if (!checked.ok) return { ok: false, error: checked.error, status: 400 };
    downloadUrl = checked.href;
  } else {
    tried = input.tried ? sanitizeMultiline(input.tried, LIMITS.tried) : null;
    expectedToolType = input.expectedToolType
      ? sanitizePlainText(input.expectedToolType, LIMITS.expectedToolType)
      : null;
  }

  const now = new Date().toISOString();
  const post: ToolPost = {
    id: randomUUID(),
    type: input.type,
    title,
    description,
    downloadUrl,
    tags,
    category,
    authorId: author.id,
    authorLabel: maskEmail(author.email),
    createdAt: now,
    updatedAt: now,
    status: "open",
    linkedShareId: null,
    tried: tried ?? null,
    expectedToolType: expectedToolType ?? null,
    searchText: buildSearchText([
      title,
      description,
      tags.join(" "),
      category,
      downloadUrl,
      tried,
      expectedToolType,
    ]),
  };

  const store = readStore();
  store.posts.unshift(post);
  writeStore(store);
  return { ok: true, post: toPublic(post) };
}

export type PatchInput = {
  status?: ToolPostStatus;
  linkedShareId?: string | null;
  /** When resolving help by creating a new share in one step */
  resolveWithShare?: {
    title: string;
    description: string;
    downloadUrl: string;
    tags?: unknown;
    category?: string;
  };
};

export type PatchResult =
  | { ok: true; post: PublicToolPost; createdShare?: PublicToolPost }
  | { ok: false; error: string; status: number };

export function patchToolPost(
  id: string,
  input: PatchInput,
  actor: { id: string; email: string },
): PatchResult {
  const store = readStore();
  const idx = store.posts.findIndex((p) => p.id === id);
  if (idx < 0) return { ok: false, error: "帖子不存在", status: 404 };
  const post = store.posts[idx];

  let createdShare: PublicToolPost | undefined;

  if (input.resolveWithShare) {
    if (post.type !== "tool_help") {
      return { ok: false, error: "仅求助帖可通过发分享解决", status: 400 };
    }
    const created = createToolPost(
      {
        type: "tool_share",
        title: input.resolveWithShare.title,
        description: input.resolveWithShare.description,
        downloadUrl: input.resolveWithShare.downloadUrl,
        tags: input.resolveWithShare.tags ?? post.tags,
        category: input.resolveWithShare.category ?? post.category ?? undefined,
      },
      actor,
    );
    if (!created.ok) return created;
    // createToolPost re-read/wrote store; reload
    const fresh = readStore();
    const i2 = fresh.posts.findIndex((p) => p.id === id);
    if (i2 < 0) return { ok: false, error: "帖子不存在", status: 404 };
    const help = fresh.posts[i2];
    help.status = "resolved";
    help.linkedShareId = created.post.id;
    help.updatedAt = new Date().toISOString();
    writeStore(fresh);
    createdShare = created.post;
    return { ok: true, post: toPublic(help), createdShare };
  }

  if (input.linkedShareId !== undefined) {
    if (input.linkedShareId) {
      const share = store.posts.find((p) => p.id === input.linkedShareId);
      if (!share || share.type !== "tool_share") {
        return { ok: false, error: "关联的分享帖不存在", status: 400 };
      }
      post.linkedShareId = share.id;
    } else {
      post.linkedShareId = null;
    }
  }

  if (input.status) {
    if (!["open", "resolved", "archived"].includes(input.status)) {
      return { ok: false, error: "非法状态", status: 400 };
    }
    post.status = input.status;
  }

  post.updatedAt = new Date().toISOString();
  store.posts[idx] = post;
  writeStore(store);
  return { ok: true, post: toPublic(post), createdShare };
}

/** Test helper: wipe runtime file (not seed). */
export function _resetStoreForTests() {
  const p = storePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
