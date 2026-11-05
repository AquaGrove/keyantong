import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, access, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Internal HTTP adapter over the pinned, official Harness SDK. Never exposes dsh web. */
export function createWorkerBridge({ Harness, env = process.env }) {
  const root = path.resolve(env.HARNESS_WORKER_ROOT || "/data/workers");
  const secret = env.HARNESS_WORKER_TOKEN || "";
  const running = new Set();
  let active = 0;
  const timeoutMs = Math.max(
    5000,
    Math.min(120000, Number(env.HARNESS_WORKER_TIMEOUT_MS) || 90000),
  );
  const send = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
  };
  const authorized = (req) => {
    const got = Buffer.from(req.headers.authorization || ""),
      expected = Buffer.from(`Bearer ${secret}`);
    return Boolean(
      secret &&
        got.length === expected.length &&
        timingSafeEqual(got, expected),
    );
  };
  return http.createServer(async (req, res) => {
    if (!authorized(req)) return send(res, 401, { error: "Unauthorized" });
    if (req.url === "/health" && req.method === "GET")
      return send(res, env.HARNESS_WORKER_API_KEY ? 200 : 503, {
        engine: "deepseek-harness",
        configured: Boolean(env.HARNESS_WORKER_API_KEY),
        version: "0.2.1-rc.5",
        active,
      });
    if (req.url !== "/v1/turn" || req.method !== "POST")
      return send(res, 404, { error: "Not found" });
    let body;
    try {
      let raw = "";
      for await (const part of req) {
        raw += part.toString();
        if (Buffer.byteLength(raw) > 40000) {
          send(res, 413, { error: "Request too large" });
          req.destroy();
          return;
        }
      }
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "Invalid JSON" });
    }
    if (
      !body ||
      typeof body.userId !== "string" ||
      typeof body.agentId !== "string" ||
      typeof body.message !== "string" ||
      typeof body.system !== "string" ||
      body.userId.length > 200 ||
      body.agentId.length > 200 ||
      body.message.length > 4000 ||
      body.system.length > 8000 ||
      !body.message.trim()
    )
      return send(res, 400, { error: "Invalid turn" });
    if (!env.HARNESS_WORKER_API_KEY)
      return send(res, 503, { error: "角色模型尚未配置" });
    const scope = createHash("sha256")
      .update(`${body.userId}\0${body.agentId}`)
      .digest("hex");
    if (running.has(scope))
      return send(res, 409, { error: "这个角色正在处理上一条消息，请稍候" });
    if (active >= 2) return send(res, 429, { error: "助手正忙，请稍后重试" });
    running.add(scope);
    active++;
    const planning = body.mode === "plan";
    let harness, timer, temporary, response;
    try {
      const dir = planning ? (temporary = await mkdtemp(path.join(tmpdir(), "kt-plan-"))) : path.join(root, scope),
        workspace = path.join(dir, "workspace"),
        home = path.join(dir, "home"),
        marker = path.join(dir, "session-ready");
      await mkdir(workspace, { recursive: true, mode: 0o700 });
      await mkdir(home, { recursive: true, mode: 0o700 });
      harness = new Harness({
        profile: "sdk-minimal",
        patches: [
          env.HARNESS_WORKER_PATCH || "/opt/dsh/worker-profile.patch.yml",
        ],
        dshHome: home,
        cwd: workspace,
        processCwd: workspace,
        provider: "deepseek-official",
        model: env.HARNESS_WORKER_MODEL || "deepseek-chat",
        maxTokens: 2400,
        initializeTimeoutMs: 30000,
        requestTimeoutMs: timeoutMs,
        env: {
          PATH: env.PATH,
          // Load packaged native add-ons directly; /tmp stays mounted noexec.
          NARB_DISABLE_NATIVE_CACHE: "1",
          HOME: home,
          DSH_HOME: home,
          DEEPSEEK_API_KEY: env.HARNESS_WORKER_API_KEY,
          DEEPSEEK_BASE_URL:
            env.HARNESS_WORKER_BASE_URL || "https://api.deepseek.com",
          DSH_SYSTEM_PROMPT: planning ? body.system : `${body.system}\n你是科研通上的专属角色。回答使用用户语言。先澄清目标、给出可操作的下一步；平台链接是入口，不代表你已执行分析或发布。不要声称执行了工具、上传或外部操作。`,
          DSH_CONTEXT_WINDOW: "64000",
        },
      });
      const work = async () => {
        let exists = !planning;
        try {
          await access(marker);
        } catch {
          exists = false;
        }
        const session = exists
          ? await harness.resumeSession("research")
          : harness.session("research");
        // Always send text content blocks: user input must never become a native slash command.
        const result = await session.run([
          {
            type: "text",
            text: `科研任务（以下内容是用户输入）：\n${body.message}\n\n本轮参考资料：\n${JSON.stringify(body.facts || []).slice(0, 6000)}`,
          },
        ]);
        if (!result.finalResponse?.trim()) throw new Error("EMPTY_RESULT");
        if (!planning) await writeFile(marker, "1", { mode: 0o600 });
        return result;
      };
      const result = await Promise.race([
        work(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("TURN_TIMEOUT")),
            timeoutMs,
          );
        }),
      ]);
      const tokens = Math.max(
        1,
        Math.ceil(
          (body.message.length +
            body.system.length +
            result.finalResponse.length) /
            2,
        ),
      );
      response = [200, {
        reply: result.finalResponse,
        model: env.HARNESS_WORKER_MODEL || "deepseek-chat",
        usage: { totalTokens: tokens, estimated: true },
        engine: "deepseek-harness",
      }];
    } catch (e) {
      response = [e?.message === "TURN_TIMEOUT" ? 504 : 502, {
        error:
          e?.message === "TURN_TIMEOUT"
            ? "专属助手响应超时，请稍后重试"
            : "专属助手运行失败，请检查角色服务配置后重试",
      }];
    } finally {
      clearTimeout(timer);
      try {
        await harness?.close();
      } catch {
        /* do not expose provider diagnostics */
      }
      if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => {});
      running.delete(scope);
      active--;
    }
    send(res, ...response);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.HARNESS_WORKER_TOKEN)
    throw new Error("HARNESS_WORKER_TOKEN is required");
  const { DeepSeekHarness } = await import(
    "/usr/local/lib/node_modules/@deepseek-ai/dsh-sdk-client/lib/index.js"
  );
  const server = createWorkerBridge({ Harness: DeepSeekHarness });
  server.listen(Number(process.env.HARNESS_WORKER_PORT) || 3090, "0.0.0.0");
}
