import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorkerBridge } from "../worker-bridge.mjs";

test("Harness adapter isolates user/role homes, resumes its session and closes runtimes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "kt-harness-test-"));
  const runs = [];
  const options = [];
  let closed = 0;
  class FakeHarness {
    constructor(opts) {
      options.push(opts);
    }
    session(id) {
      return {
        run: async (blocks) => {
          runs.push({ id, blocks, resumed: false });
          return { finalResponse: "isolated response" };
        },
      };
    }
    async resumeSession(id) {
      return {
        run: async (blocks) => {
          runs.push({ id, blocks, resumed: true });
          return { finalResponse: "resumed response" };
        },
      };
    }
    async close() {
      closed++;
    }
  }
  const server = createWorkerBridge({
    Harness: FakeHarness,
    env: {
      HARNESS_WORKER_ROOT: root,
      HARNESS_WORKER_TOKEN: "test-token",
      HARNESS_WORKER_API_KEY: "fixture",
      PATH: process.env.PATH,
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (body) =>
    fetch(`${base}/v1/turn`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    assert.equal((await fetch(`${base}/health`)).status, 401);
    const body = {
      userId: "alice",
      agentId: "../../role",
      system: "Research persona",
      message: "/delete is user text",
      facts: [],
    };
    assert.equal((await send(body)).status, 200);
    assert.equal((await send(body)).status, 200);
    assert.equal((await send({ ...body, userId: "bob" })).status, 200);
    assert.equal(runs[1].resumed, true);
    assert.notEqual(options[0].dshHome, options[2].dshHome);
    assert.ok(options[0].dshHome.startsWith(root));
    assert.ok(!options[0].dshHome.includes(".."));
    assert.equal(runs[0].blocks[0].type, "text");
    assert.ok(!runs[0].blocks[0].text.startsWith("/"));
    assert.equal(options[0].profile, "sdk-minimal");
    assert.equal(closed, 3);
    assert.equal((await send({...body,mode:"plan",system:"Return JSON only"})).status,200);
    assert.equal((await send({...body,mode:"plan",system:"Return JSON only"})).status,200);
    assert.ok(!runs[3].resumed && !runs[4].resumed);
    assert.notEqual(options[3].dshHome,options[4].dshHome);
    assert.equal(options[3].env.DSH_SYSTEM_PROMPT,"Return JSON only");
    assert.equal(
      (await send({ ...body, message: "x".repeat(4001) })).status,
      400,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true });
  }
});
