/**
 * Dual ledger (MVP):
 * - user points / call counts per Asia/Shanghai day
 * - supplier raw token counter (site-wide)
 * Tries Redis (REDIS_URL) with short timeout; falls back to memory.
 */

import net from "node:net";
import { pointsFromTokens, type LlmTier } from "./models";

type MemCounter = { value: number; expireAt: number };
const mem = new Map<string, MemCounter>();

function shanghaiDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function msUntilShanghaiMidnight(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const elapsed = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000;
  return Math.max(1000, 24 * 60 * 60 * 1000 - elapsed);
}

function memGet(key: string): number {
  const e = mem.get(key);
  if (!e) return 0;
  if (Date.now() > e.expireAt) {
    mem.delete(key);
    return 0;
  }
  return e.value;
}

function memIncr(key: string, by: number, ttlMs: number): number {
  const now = Date.now();
  const e = mem.get(key);
  if (!e || now > e.expireAt) {
    const v = Math.max(0, by);
    mem.set(key, { value: v, expireAt: now + ttlMs });
    return v;
  }
  e.value += by;
  return e.value;
}

function parseRedisUrl(url: string): { host: string; port: number } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname || "127.0.0.1", port: Number(u.port || 6379) || 6379 };
  } catch {
    return null;
  }
}

/** Single Redis command; returns raw RESP payload or null on failure. */
function redisRaw(host: string, port: number, args: string[], timeoutMs = 400): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    socket.on("error", () => done(null));
    socket.on("connect", () => {
      const parts: string[] = [`*${args.length}`];
      for (const a of args) {
        const b = Buffer.from(a, "utf8");
        parts.push(`$${b.length}`, a);
      }
      socket.write(parts.join("\r\n") + "\r\n");
    });
    socket.on("data", (c) => {
      chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.includes("\r\n")) done(raw);
    });
  });
}

function parseIntReply(raw: string | null): number | null {
  if (!raw) return null;
  if (raw.startsWith(":")) {
    const n = Number(raw.slice(1).split("\r\n")[0]);
    return Number.isFinite(n) ? n : null;
  }
  if (raw.startsWith("$")) {
    const lines = raw.split("\r\n");
    if (lines[0] === "$-1") return null;
    const val = lines[1];
    if (val != null && /^\d+$/.test(val)) return Number(val);
  }
  return null;
}

async function redisIncrBy(key: string, by: number, ttlMs: number): Promise<number | null> {
  const url = (process.env.REDIS_URL || "").trim();
  if (!url) return null;
  const ep = parseRedisUrl(url);
  if (!ep) return null;
  const raw = await redisRaw(ep.host, ep.port, ["INCRBY", key, String(by)]);
  const n = parseIntReply(raw);
  if (n == null) return null;
  await redisRaw(ep.host, ep.port, ["PEXPIRE", key, String(ttlMs)]);
  return n;
}

async function redisGetNum(key: string): Promise<number | null> {
  const url = (process.env.REDIS_URL || "").trim();
  if (!url) return null;
  const ep = parseRedisUrl(url);
  if (!ep) return null;
  const raw = await redisRaw(ep.host, ep.port, ["GET", key]);
  if (!raw) return null;
  if (raw.startsWith("$-1")) return 0;
  const n = parseIntReply(raw);
  return n;
}

async function incr(key: string, by: number, ttlMs: number): Promise<number> {
  const r = await redisIncrBy(key, by, ttlMs);
  if (r != null) return r;
  return memIncr(key, by, ttlMs);
}

async function get(key: string): Promise<number> {
  const r = await redisGetNum(key);
  if (r != null) return r;
  return memGet(key);
}

export type QuotaSnapshot = {
  day: string;
  pointsUsed: number;
  pointsBudget: number;
  pointsRemaining: number;
  callsUsed: number;
  callsBudget: number;
  callsRemaining: number;
  reasoningCallsUsed: number;
  reasoningCallCap: number;
};

export async function readQuota(
  userId: string,
  opts: { pointsBudget: number; callsBudget: number; reasoningCap: number },
): Promise<QuotaSnapshot> {
  const day = shanghaiDayKey();
  const pointsUsed = await get(`kt:ai:pts:${userId}:${day}`);
  const callsUsed = await get(`kt:ai:calls:${userId}:${day}`);
  const reasoningCallsUsed = await get(`kt:ai:reason:${userId}:${day}`);
  return {
    day,
    pointsUsed,
    pointsBudget: opts.pointsBudget,
    pointsRemaining: Math.max(0, opts.pointsBudget - pointsUsed),
    callsUsed,
    callsBudget: opts.callsBudget,
    callsRemaining: Math.max(0, opts.callsBudget - callsUsed),
    reasoningCallsUsed,
    reasoningCallCap: opts.reasoningCap,
  };
}

export type ReserveResult =
  | { ok: true; day: string }
  | { ok: false; code: "calls" | "points" | "reasoning"; snapshot: QuotaSnapshot };

export async function assertWithinQuota(
  userId: string,
  tier: LlmTier,
  opts: { pointsBudget: number; callsBudget: number; reasoningCap: number },
): Promise<ReserveResult> {
  const snap = await readQuota(userId, opts);
  if (snap.callsRemaining <= 0) return { ok: false, code: "calls", snapshot: snap };
  if (snap.pointsRemaining <= 0) return { ok: false, code: "points", snapshot: snap };
  if (tier === "reasoning" && snap.reasoningCallsUsed >= opts.reasoningCap) {
    return { ok: false, code: "reasoning", snapshot: snap };
  }
  return { ok: true, day: snap.day };
}

export async function commitUsage(opts: {
  userId: string;
  tier: LlmTier;
  tokens: number;
  reasoningCap: number;
}): Promise<{ points: number; day: string }> {
  const day = shanghaiDayKey();
  const ttl = msUntilShanghaiMidnight();
  const points = pointsFromTokens(opts.tokens, opts.tier);
  await incr(`kt:ai:pts:${opts.userId}:${day}`, points, ttl);
  await incr(`kt:ai:calls:${opts.userId}:${day}`, 1, ttl);
  if (opts.tier === "reasoning") {
    await incr(`kt:ai:reason:${opts.userId}:${day}`, 1, ttl);
  }
  await incr(`kt:ai:sup:${day}`, Math.max(0, opts.tokens), ttl);
  return { points, day };
}
