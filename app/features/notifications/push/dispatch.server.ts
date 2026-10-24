import * as Sentry from "@sentry/react-router";
import webpush from "web-push";

import { getPushConfig } from "./config.server";
import {
  claimPushDeliveries,
  finishPushDelivery,
  getPushDeliveryTarget,
  maintainPushQueue,
  removeExpiredPushSubscription,
} from "./store.server";
import { isAllowedPushEndpoint } from "./validation";

export async function dispatchPushQueue(scope?: {
  scheduleId: number;
  actorProfileId: string;
}) {
  const config = getPushConfig();
  if (!config) return { configured: false, processed: 0 };
  if (!scope) await maintainPushQueue();
  const deliveries = await claimPushDeliveries(scope);
  // Keep at most five HTTP requests in flight. The request waits for persistence;
  // there are no detached promises that Vercel could terminate after responding.
  for (let offset = 0; offset < deliveries.length; offset += 5) {
    const results = await Promise.allSettled(
      deliveries.slice(offset, offset + 5).map(async (delivery) => {
        const target = await getPushDeliveryTarget(
          delivery.delivery_id,
          delivery.claim_token,
        );
        if (
          !target ||
          !target.eligible ||
          !isAllowedPushEndpoint(target.endpoint)
        ) {
          await finishPushDelivery(
            delivery,
            "SKIPPED",
            "recipient_unavailable",
          );
          return;
        }
        let sendError: unknown;
        try {
          await webpush.sendNotification(
            {
              endpoint: target.endpoint,
              keys: { p256dh: target.p256dh, auth: target.auth },
            },
            JSON.stringify({
              title: target.title,
              body: target.body,
              tag: `schedule-${target.event_id}`,
              url: "/admin/schedules",
            }),
            {
              vapidDetails: config,
              TTL: 3600,
              urgency: "high",
              timeout: 4000,
            },
          );
        } catch (error) {
          sendError = error;
        }
        // Persist failures separately from sending: a DB outage after an accepted
        // send must leave the lease intact, rather than trigger an immediate resend.
        if (!sendError) {
          await finishPushDelivery(delivery, "SENT");
          return;
        }
        const status =
          typeof sendError === "object" &&
          sendError &&
          "statusCode" in sendError
            ? Number(sendError.statusCode)
            : 0;
        if (status === 404 || status === 410) {
          await removeExpiredPushSubscription(target.subscription_id);
          return;
        }
        const retryable =
          status === 0 || status === 408 || status === 429 || status >= 500;
        await finishPushDelivery(
          delivery,
          retryable && delivery.attempts < 5 ? "PENDING" : "FAILED",
          status ? `push_http_${status}` : "push_network_error",
        );
      }),
    );
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("Push delivery state could not be persisted");
    }
  }
  return { configured: true, processed: deliveries.length };
}

export async function dispatchSchedulePush(
  scheduleId: number,
  actorProfileId: string,
) {
  try {
    await dispatchPushQueue({ scheduleId, actorProfileId });
  } catch {
    // Never turn an already committed booking/cancellation into an API failure.
    // Do not log endpoint URLs, subscription keys, or student payloads.
    Sentry.captureMessage(
      "Immediate Web Push failed; queued for retry",
      "warning",
    );
  }
}
