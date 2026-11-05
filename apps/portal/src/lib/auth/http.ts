import { NextResponse } from "next/server";
import { AuthError } from "./types";
export function authFailure(error: unknown) {
  if (error instanceof AuthError)
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.code === "NEED_VERIFY" ? { needVerify: true } : {}),
      },
      { status: error.status },
    );
  console.error(
    "[auth] operation failed",
    error instanceof Error ? error.name : "unknown",
  );
  return NextResponse.json(
    { ok: false, error: "账号服务暂时不可用，请稍后重试" },
    { status: 503 },
  );
}
