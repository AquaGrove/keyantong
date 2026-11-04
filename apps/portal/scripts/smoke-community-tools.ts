/**
 * Smoke: share → search hit; empty search → help; resolve link.
 * Run: cd apps/portal && pnpm exec tsx scripts/smoke-community-tools.ts
 */
import assert from "node:assert/strict";
import {
  _resetStoreForTests,
  createToolPost,
  listToolPosts,
  patchToolPost,
} from "../src/lib/community/tool-posts";
import {
  looksLikePiracySolicitation,
  validatePublicHttpUrl,
  sanitizePlainText,
  rateLimit,
} from "../src/lib/security";

_resetStoreForTests();

assert.equal(validatePublicHttpUrl("javascript:alert(1)").ok, false);
assert.equal(validatePublicHttpUrl("https://example.com/tool").ok, true);
assert.equal(validatePublicHttpUrl("https://sci-hub.se/10.1/2").ok, false);
assert.ok(looksLikePiracySolicitation("求PDF全文 sci-hub"));
assert.equal(sanitizePlainText("<script>x</script>hi", 100), "scriptx/scripthi");

const author = { id: "u-test", email: "tester@campus.edu.cn" };
const share = createToolPost(
  {
    type: "tool_share",
    title: "SmokeTool Alpha",
    description: "用于冒烟测试的示例生物信息工具描述，足够长。",
    downloadUrl: "https://example.com/smoke-tool",
    tags: ["smoke", "rnaseq"],
  },
  author,
);
if (!share.ok) throw new Error(share.error);

const hit = listToolPosts({ q: "SmokeTool", type: "tool_share" });
assert.ok(hit.total >= 1);
assert.equal(hit.suggestHelp, false);

const miss = listToolPosts({ q: "zzznothing-match-xyz", type: "tool_share" });
assert.equal(miss.total, 0);
assert.equal(miss.suggestHelp, true);

const help = createToolPost(
  {
    type: "tool_help",
    title: "求一个不存在的工具 XYZ",
    description: "搜索无结果，希望有人推荐合法下载入口。",
    tags: ["smoke"],
  },
  author,
);
if (!help.ok) throw new Error(help.error);

const helps = listToolPosts({ type: "tool_help", status: "open" });
assert.ok(helps.items.some((p) => p.id === help.post.id));

const resolved = patchToolPost(
  help.post.id,
  {
    resolveWithShare: {
      title: "推荐：Smoke Resolver",
      description: "解决求助的分享帖，含合法官网链接说明。",
      downloadUrl: "https://example.org/resolver",
      tags: ["smoke"],
    },
  },
  author,
);
if (!resolved.ok) throw new Error(resolved.error);
assert.equal(resolved.post.status, "resolved");
assert.ok(resolved.createdShare?.id);
assert.equal(resolved.post.linkedShareId, resolved.createdShare?.id);

const piracy = createToolPost(
  {
    type: "tool_share",
    title: "bad share",
    description: "这里教你用 sci-hub 下PDF全文",
    downloadUrl: "https://example.com/x",
  },
  author,
);
assert.equal(piracy.ok, false);

const rl1 = rateLimit("smoke:k", { windowMs: 60_000, max: 2 });
const rl2 = rateLimit("smoke:k", { windowMs: 60_000, max: 2 });
const rl3 = rateLimit("smoke:k", { windowMs: 60_000, max: 2 });
assert.equal(rl1.ok && rl2.ok, true);
assert.equal(rl3.ok, false);

console.log("smoke-community-tools: OK");
