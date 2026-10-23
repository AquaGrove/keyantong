export async function sendCampusCode(email: string, code: string): Promise<{ echoed: boolean }> {
  const smtpUrl = process.env.SMTP_URL;
  if (smtpUrl) {
    // Optional: operators can point SMTP_URL at a transactional provider later.
    console.info(`[mail] would send via SMTP_URL to ${email}`);
  }
  console.info(`[campus-code] ${email} => ${code}`);
  const echo =
    process.env.EMAIL_DEV_ECHO === "true" || process.env.NODE_ENV !== "production";
  return { echoed: echo };
}
