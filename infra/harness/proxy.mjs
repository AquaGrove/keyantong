#!/usr/bin/env node
/**
 * Tiny reverse proxy: 0.0.0.0:PROXY_PORT → 127.0.0.1:DSH_PORT
 * DeepSeek Harness rejects --host 0.0.0.0; keep dsh on loopback only.
 * Optional HTTP Basic Auth via PROXY_USERNAME / PROXY_PASSWORD.
 */
import http from "node:http";
import net from "node:net";
import { request as httpRequest } from "node:http";

const DSH_PORT = Number(process.env.DSH_PORT || 3079);
const PROXY_PORT = Number(process.env.PROXY_PORT || 3080);
const USER = (process.env.PROXY_USERNAME || "").trim();
const PASS = (process.env.PROXY_PASSWORD || "").trim();
const requireAuth = Boolean(USER && PASS);

function unauthorized(res) {
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="keyantong-harness"',
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end("Authentication required");
}

function checkAuth(req) {
  if (!requireAuth) return true;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(h.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    const u = i >= 0 ? decoded.slice(0, i) : "";
    const p = i >= 0 ? decoded.slice(i + 1) : "";
    return u === USER && p === PASS;
  } catch {
    return false;
  }
}

function proxyHttp(req, res) {
  if (!checkAuth(req)) return unauthorized(res);
  const headers = { ...req.headers, host: `127.0.0.1:${DSH_PORT}` };
  const pReq = httpRequest(
    {
      hostname: "127.0.0.1",
      port: DSH_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (pRes) => {
      res.writeHead(pRes.statusCode || 502, pRes.headers);
      pRes.pipe(res);
    },
  );
  pReq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("harness upstream unavailable");
  });
  req.pipe(pReq);
}

const server = http.createServer(proxyHttp);

server.on("upgrade", (req, socket, head) => {
  if (!checkAuth(req)) {
    socket.write(
      "HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"keyantong-harness\"\r\nConnection: close\r\n\r\n",
    );
    socket.destroy();
    return;
  }
  const upstream = net.connect(DSH_PORT, "127.0.0.1", () => {
    const lines = [
      `${req.method} ${req.url} HTTP/${req.httpVersion}`,
      ...Object.entries(req.headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(",") : v}`),
      "",
      "",
    ];
    upstream.write(lines.join("\r\n"));
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`[harness-proxy] 0.0.0.0:${PROXY_PORT} → 127.0.0.1:${DSH_PORT} auth=${requireAuth}`);
});
