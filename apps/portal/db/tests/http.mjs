import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_PORTAL_URL;
if (!base?.includes("portal-validation"))
  throw new Error("Only isolated test server allowed");
const email = `http-${randomUUID()}@example.edu`,
  password = randomUUID();
async function post(path, body, cookie) {
  return fetch(base + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}
const health = await fetch(base + "/api/health");
assert.equal((await health.json()).identity, "postgres");
const reg = await post("/api/auth/register", { email, password });
assert.equal(reg.status, 200);
const { devCode } = await reg.json();
assert.ok(devCode);
assert.equal(
  (await post("/api/auth/verify", { email, code: devCode })).status,
  200,
);
const login = await post("/api/auth/login", {
  email,
  password,
  deviceId: "http-device",
});
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .find((v) => v.startsWith("kt_user_session="))
  ?.split(";")[0];
assert.ok(cookie);
const me = await fetch(base + "/api/me", { headers: { cookie } });
assert.equal(me.status, 200);
const text = await me.text();
assert.ok(!text.includes("passwordHash"));
const out = await post("/api/auth/logout", {}, cookie);
assert.equal(out.status, 303);
const after = await fetch(base + "/api/me", { headers: { cookie } });
assert.equal((await after.json()).user, null);
console.log(JSON.stringify({ ok: true, httpChecks: 7, sessionRevoked: true }));
