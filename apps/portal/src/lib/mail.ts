export async function sendCampusCode(
  email: string,
  code: string,
): Promise<{ echoed: boolean; reason?: string }> {
  const smtpUrl = process.env.SMTP_URL?.trim();
  if (smtpUrl) {
    // Optional: operators can point SMTP_URL at a transactional provider later.
    console.info(`[mail] would send via SMTP_URL to ${email}`);
    // Until a real SMTP client is wired, still echo so operators are not blocked.
    // Set EMAIL_DEV_ECHO=false and implement nodemailer/resend before relying on inbox delivery.
  }
  console.info(`[campus-code] ${email} => ${code}`);
  const forceEcho = process.env.EMAIL_DEV_ECHO === "true";
  const noSmtp = !smtpUrl;
  const nonProd = process.env.NODE_ENV !== "production";
  // MVP: without SMTP, always return the code in API so registration is usable.
  const echoed = forceEcho || noSmtp || nonProd;
  return {
    echoed,
    reason: noSmtp && !forceEcho ? "smtp_unconfigured" : undefined,
  };
}
