import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createResearchPost,
  listResearchPosts,
  getResearchPost,
  respondToPost,
  acceptResponse,
} from "../src/lib/community/posts";
import { detectIntent, planForIntent } from "../src/lib/dispatch/intent";
import { buildGraph } from "../src/lib/openalex";

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kt-commons-test-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  const alice = { id: "test-alice", email: "alice@example.edu" },
    bob = { id: "test-bob", email: "bob@example.edu" };
  try {
    assert.equal(listResearchPosts().total, 0);
    const post = createResearchPost(
      {
        kind: "literature",
        title: "Fixture literature request",
        body: "Test-only OA path request",
        doi: "fixture-doi",
      },
      alice,
    );
    assert.equal(post.isOwner, true);
    assert.equal(post.authorLabel, "a***@example.edu");
    assert.ok(!JSON.stringify(post).includes('"authorId"'));
    const reply = respondToPost(
      post.id,
      { body: "Test-only legal link", url: "https://example.edu/repository" },
      bob,
    );
    assert.equal(reply.responseCount, 1);
    assert.throws(() => acceptResponse(post.id, reply.responses[0].id, bob.id));
    const accepted = acceptResponse(post.id, reply.responses[0].id, alice.id);
    assert.equal(accepted.acceptedResponseId, reply.responses[0].id);
    assert.equal(listResearchPosts({ status: "open" }).total, 0);
    assert.equal(getResearchPost(post.id, bob.id)?.isOwner, false);
    assert.throws(() =>
      createResearchPost(
        { kind: "__proto__", title: "Invalid kind", body: "Text" },
        alice,
      ),
    );
    assert.throws(() =>
      respondToPost(
        post.id,
        { body: "Invalid URL", url: "javascript:alert(1)" },
        bob,
      ),
    );
    assert.throws(() =>
      respondToPost(
        post.id,
        { body: "Invalid URL", url: "https://localhost/test" },
        bob,
      ),
    );
    assert.equal(listResearchPosts({ kind: "daily" }).total, 0);
    assert.equal(listResearchPosts({ q: "fixture" }).total, 1);
    assert.equal(detectIntent("GWAS 分析"), "analysis");
    assert.equal(detectIntent("分享科研心得"), "forum");
    assert.equal(planForIntent("rnaseq").next?.href, "/analysis/rnaseq");
    const originalFetch = global.fetch;
    const work = (id: string, refs: string[] = []) => ({
      id: `https://openalex.org/${id}`,
      display_name: `Test fixture ${id}`,
      referenced_works: refs.map((r) => `https://openalex.org/${r}`),
      cited_by_count: 3,
    });
    global.fetch = (async (input) => {
      const u = new URL(String(input));
      let data: unknown;
      if (u.pathname.includes("/works/W1")) data = work("W1", ["W2"]);
      else if (u.searchParams.get("filter")?.startsWith("cites:"))
        data = { results: [work("W3", ["W1", "W2"])] };
      else data = { results: [work("W2")] };
      return new Response(JSON.stringify(data));
    }) as typeof fetch;
    try {
      const result = await buildGraph("W1");
      assert.equal(result.graph?.nodes.length, 3);
      assert.ok(
        result.graph?.edges.some((e) => e.from === "W3" && e.to === "W2"),
      );
      assert.ok(
        result.graph?.edges.some((e) => e.from === "W1" && e.to === "W2"),
      );
    } finally {
      global.fetch = originalFetch;
    }
    console.log(
      "research-commons: persistence, privacy, ownership, links, dispatch and citation edges OK",
    );
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    fs.rmSync(root, { recursive: true });
  }
}
void main();
