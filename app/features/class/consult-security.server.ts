import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export function getConsultConfig() {
  const secret =
    process.env.CONSULT_RATE_LIMIT_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return { secret };
}

export function consultHash(secret: string, kind: string, value: string) {
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}

export function consultClientIp(request: Request) {
  // Vercel overwrites this header. Never trust a user-supplied X-Forwarded-For.
  if (process.env.VERCEL === "1") {
    const value = request.headers
      .get("x-vercel-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    return value && isIP(value) ? value : null;
  }
  // Local execution shares a single budget; production must use the trusted edge.
  return process.env.NODE_ENV === "production" ? null : "local";
}
