import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const DEMO_PAYMENT_AMOUNT = 10_000;
const ORDER_TTL_MS = 2 * 60 * 60 * 1000;

/** The scaffold's NFT checkout is a sandbox demonstration, not a live product. */
export function isPaymentDemoEnabled(
  mode: string | undefined,
  secret: string | undefined,
): boolean {
  return mode !== "production" && /^test_(?:sk|gsk)_/.test(secret ?? "");
}

function signature(userId: string, order: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${userId}:${order}:${DEMO_PAYMENT_AMOUNT}`)
    .digest("base64url")
    .slice(0, 22);
}

export function createDemoOrder(
  userId: string,
  secret: string,
  now = Date.now(),
): string {
  const order = `${now.toString(36)}_${randomBytes(12).toString("base64url")}`;
  return `${order}_${signature(userId, order, secret)}`;
}

export function isValidDemoOrder(
  orderId: string,
  userId: string,
  secret: string,
  now = Date.now(),
): boolean {
  const match = /^([a-z0-9]+)_([\w-]{16})_([\w-]{22})$/.exec(orderId);
  if (!match) return false;
  const createdAt = parseInt(match[1], 36);
  if (
    !Number.isSafeInteger(createdAt) ||
    createdAt > now + 60_000 ||
    now - createdAt > ORDER_TTL_MS
  )
    return false;
  return timingSafeEqual(
    Buffer.from(match[3]),
    Buffer.from(signature(userId, `${match[1]}_${match[2]}`, secret)),
  );
}
