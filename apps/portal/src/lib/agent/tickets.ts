import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
const developmentSecret = randomBytes(32).toString("hex");
function secret() {
  const s =
    process.env.AGENT_ACTION_SECRET ||
    process.env.VERIFICATION_CODE_SECRET ||
    (process.env.NODE_ENV !== "production" ? developmentSecret : "");
  if (s.length < 32) throw new Error("Action signing is not configured");
  return s;
}
export type Action = {
  id: string;
  actor: string;
  kind:
    | "resource"
    | "post"
    | "reply"
    | "worker"
    | "revoke_device"
    | "read_notice"
    | "accept_reply";
  payload: Record<string, unknown>;
  expires: number;
};
export function signAction(
  actor: string,
  kind: Action["kind"],
  payload: Record<string, unknown>,
) {
  const action: Action = {
    id: randomUUID(),
    actor,
    kind,
    payload,
    expires: Date.now() + 10 * 60000,
  };
  const body = Buffer.from(JSON.stringify(action)).toString("base64url");
  const signature = createHmac("sha256", secret())
    .update("kt-agent-action-v1\0" + body)
    .digest("base64url");
  return `${body}.${signature}`;
}
export function verifyAction(token: string, actor: string): Action {
  if (token.length > 22000) throw new Error("确认内容过长");
  const [body, signature, ...extra] = token.split(".");
  if (!body || !signature || extra.length) throw new Error("确认内容无效");
  const expected = createHmac("sha256", secret())
    .update("kt-agent-action-v1\0" + body)
    .digest();
  const got = Buffer.from(signature, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected))
    throw new Error("确认内容已变化，请重新生成草稿");
  const action = JSON.parse(
    Buffer.from(body, "base64url").toString(),
  ) as Action;
  if (
    action.actor !== actor ||
    action.expires < Date.now() ||
    !Number.isFinite(action.expires) ||
    !/^[0-9a-f-]{36}$/.test(action.id) ||
    ![
      "resource",
      "post",
      "reply",
      "worker",
      "revoke_device",
      "read_notice",
      "accept_reply",
    ].includes(action.kind)
  )
    throw new Error("该操作已过期或不属于当前账号");
  return action;
}
