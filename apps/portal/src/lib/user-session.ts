import { authUsesPostgres } from "./db/pool";
import { userForSession } from "./auth/postgres";
import { cookies, headers } from "next/headers";
import { hmacHex } from "./crypto-user";
import { getUserById, type User } from "./user-store";

export const USER_COOKIE = "kt_user_session";
export const DEVICE_COOKIE = "kt_device_id";

function secret() {
  return (
    process.env.USER_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "dev-user-secret"
  );
}

export async function createUserToken(
  userId: string,
  ttlMs = 14 * 24 * 60 * 60 * 1000,
) {
  const exp = Date.now() + ttlMs;
  const payload = `u.${userId}.${exp}`;
  const sig = await hmacHex(secret(), payload);
  return `${payload}.${sig}`;
}

export async function verifyUserToken(
  token: string | undefined,
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "u") return null;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  const payload = `u.${parts[1]}.${parts[2]}`;
  const expected = await hmacHex(secret(), payload);
  if (expected.length !== parts[3].length) return null;
  let ok = true;
  for (let i = 0; i < expected.length; i++)
    if (expected[i] !== parts[3][i]) ok = false;
  return ok ? parts[1] : null;
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(USER_COOKIE)?.value;
  const actor = (await headers()).get("x-keyantong-actor");
  const user = authUsesPostgres()
    ? await userForSession(token)
    : await (async () => {
        const id = await verifyUserToken(token);
        return id ? await getUserById(id) : null;
      })();
  return actor && actor !== user?.id ? null : user ?? null;
}

export function sessionCookieOptions(maxAge = 14 * 24 * 60 * 60) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
