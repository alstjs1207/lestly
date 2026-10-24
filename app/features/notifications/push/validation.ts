import { z } from "zod";

// Subscription endpoints are untrusted input used for server-side HTTP calls.
// Restrict them to known browser push services; never fetch arbitrary URLs.
export function isAllowedPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      ((url.hostname === "fcm.googleapis.com" && url.pathname.length > 1) ||
        (url.hostname.endsWith(".push.apple.com") &&
          url.pathname.startsWith("/")) ||
        (url.hostname === "updates.push.services.mozilla.com" &&
          url.pathname.startsWith("/wpush/")))
    );
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(isAllowedPushEndpoint),
  expirationTime: z
    .number()
    .finite()
    .positive()
    .max(8.64e15)
    .nullable()
    .optional(),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}={0,2}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/),
  }),
});

export type BrowserPushSubscription = z.infer<typeof pushSubscriptionSchema>;
