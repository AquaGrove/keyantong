import { getSiteUrl } from "@keyantong/ops-shared";

export function getPortalBaseUrl() {
  return (
    process.env.PORTAL_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    getSiteUrl()
  ).replace(/\/$/, "");
}

export function getInternalSecret() {
  return (
    process.env.INTERNAL_API_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    ""
  );
}

export async function portalFetch(path: string, init?: RequestInit) {
  const secret = getInternalSecret();
  if (!secret) {
    throw new Error("未配置 INTERNAL_API_SECRET");
  }
  const res = await fetch(`${getPortalBaseUrl()}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  return res;
}
