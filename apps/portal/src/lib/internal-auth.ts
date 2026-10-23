export function assertInternal(request: Request): boolean {
  const secret =
    process.env.INTERNAL_API_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const hdr = request.headers.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : request.headers.get("x-internal-secret");
  return token === secret;
}
