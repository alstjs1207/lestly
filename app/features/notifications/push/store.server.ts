import type { BrowserPushSubscription } from "./validation";

import { sql } from "drizzle-orm";

import db from "~/core/db/drizzle-client.server";

export async function savePushSubscription(
  organizationId: string,
  profileId: string,
  deviceId: string,
  subscription: BrowserPushSubscription,
) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM public.push_subscriptions
      WHERE device_id = ${deviceId}::uuid AND endpoint <> ${subscription.endpoint}`);
    const rows = await tx.execute(sql`
      INSERT INTO public.push_subscriptions(organization_id, profile_id, device_id, endpoint, p256dh, auth, expires_at)
      VALUES (${organizationId}::uuid, ${profileId}::uuid, ${deviceId}::uuid,
        ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth},
        ${subscription.expirationTime ? new Date(subscription.expirationTime).toISOString() : null}::timestamptz)
      ON CONFLICT (endpoint) DO UPDATE SET
        organization_id = EXCLUDED.organization_id, profile_id = EXCLUDED.profile_id,
        device_id = EXCLUDED.device_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        expires_at = EXCLUDED.expires_at, updated_at = now()
      WHERE push_subscriptions.device_id = EXCLUDED.device_id OR
        (push_subscriptions.p256dh = EXCLUDED.p256dh AND push_subscriptions.auth = EXCLUDED.auth)
      RETURNING subscription_id
    `);
    if (!rows.length) throw new Error("Push subscription ownership mismatch");
  });
}

export async function hasPushSubscription(
  organizationId: string,
  profileId: string,
  deviceId: string,
) {
  const rows = await db.execute(sql`SELECT 1 FROM public.push_subscriptions
    WHERE device_id = ${deviceId}::uuid AND organization_id = ${organizationId}::uuid
      AND profile_id = ${profileId}::uuid AND (expires_at IS NULL OR expires_at > now())`);
  return rows.length > 0;
}

export async function removePushDevice(deviceId: string) {
  // deviceId is a cryptographically random, HttpOnly device capability. Removing
  // every account binding on this device also handles expired sessions/logout.
  await db.execute(
    sql`DELETE FROM public.push_subscriptions WHERE device_id = ${deviceId}::uuid`,
  );
}

export async function removeStalePushDevice(
  deviceId: string,
  authUserId: string | null,
) {
  await db.execute(sql`DELETE FROM public.push_subscriptions s WHERE s.device_id = ${deviceId}::uuid
    AND NOT EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.organization_members m ON m.profile_id = p.profile_id AND m.organization_id = s.organization_id
      WHERE p.profile_id = s.profile_id AND p.auth_user_id = ${authUserId}::uuid
        AND m.role = 'ADMIN' AND m.state = 'NORMAL')`);
}

export async function getInstructorPushAccounts(organizationId: string) {
  return db.execute<{ profile_id: string; name: string }>(sql`
    SELECT p.profile_id, p.name FROM public.organization_members m
    JOIN public.profiles p USING (profile_id)
    WHERE m.organization_id = ${organizationId}::uuid AND m.role = 'ADMIN'
      AND m.state = 'NORMAL' AND p.auth_user_id IS NOT NULL ORDER BY p.name
  `);
}

export async function isInstructorPushAccount(
  organizationId: string,
  profileId: string | null,
) {
  if (!profileId) return true;
  const rows = await db.execute(sql`SELECT 1 FROM public.organization_members m
    JOIN public.profiles p USING (profile_id)
    WHERE m.organization_id = ${organizationId}::uuid AND m.profile_id = ${profileId}::uuid
      AND m.role = 'ADMIN' AND m.state = 'NORMAL' AND p.auth_user_id IS NOT NULL`);
  return rows.length > 0;
}

export type ClaimedPushDelivery = {
  delivery_id: string;
  claim_token: string;
  attempts: number;
};

export async function claimPushDeliveries(scope?: {
  scheduleId: number;
  actorProfileId: string;
}) {
  return db.execute<ClaimedPushDelivery>(sql`
    WITH due AS (
      SELECT d.delivery_id FROM public.push_deliveries d
      JOIN public.push_events e ON e.event_id = d.event_id
      WHERE ((d.status = 'PENDING' AND d.next_attempt_at <= now()) OR
        (d.status = 'SENDING' AND d.locked_until < now()))
        AND d.attempts < 5
        ${scope ? sql`AND e.schedule_id = ${scope.scheduleId} AND e.actor_profile_id = ${scope.actorProfileId}::uuid` : sql``}
      ORDER BY d.next_attempt_at LIMIT ${scope ? 10 : 25}
      FOR UPDATE OF d SKIP LOCKED
    )
    UPDATE public.push_deliveries d SET status = 'SENDING', attempts = attempts + 1,
      locked_until = now() + interval '2 minutes', claim_token = gen_random_uuid()
    FROM due WHERE d.delivery_id = due.delivery_id
    RETURNING d.delivery_id, d.claim_token, d.attempts
  `);
}

export type PushTarget = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  event_id: string;
  title: string;
  body: string;
  schedule_id: number;
  eligible: boolean;
};

export async function getPushDeliveryTarget(
  deliveryId: string,
  claimToken: string,
) {
  const rows = await db.execute<PushTarget>(sql`
    SELECT s.subscription_id, s.endpoint, s.p256dh, s.auth,
      e.event_id, e.title, e.body, e.schedule_id,
      (s.organization_id = e.organization_id AND s.profile_id = e.recipient_profile_id
        AND i.push_profile_id = e.recipient_profile_id
        AND m.role = 'ADMIN' AND m.state = 'NORMAL' AND p.auth_user_id IS NOT NULL
        AND (s.expires_at IS NULL OR s.expires_at > now())
        AND e.created_at > now() - interval '24 hours') AS eligible
    FROM public.push_deliveries d
    JOIN public.push_events e ON e.event_id = d.event_id
    JOIN public.push_subscriptions s ON s.subscription_id = d.subscription_id
    JOIN public.instructors i ON i.instructor_id = e.instructor_id AND i.organization_id = e.organization_id
    JOIN public.organization_members m ON m.profile_id = e.recipient_profile_id AND m.organization_id = e.organization_id
    JOIN public.profiles p ON p.profile_id = m.profile_id
    WHERE d.delivery_id = ${deliveryId}::uuid AND d.claim_token = ${claimToken}::uuid AND d.status = 'SENDING'
  `);
  return rows[0] ?? null;
}

export async function finishPushDelivery(
  delivery: ClaimedPushDelivery,
  status: string,
  error: string | null = null,
) {
  await db.execute(sql`UPDATE public.push_deliveries SET status = ${status},
    last_error = ${error}, locked_until = NULL,
    next_attempt_at = now() + make_interval(secs => ${Math.min(3600, 30 * 2 ** delivery.attempts)}),
    sent_at = CASE WHEN ${status} = 'SENT' THEN now() ELSE sent_at END
    WHERE delivery_id = ${delivery.delivery_id}::uuid AND claim_token = ${delivery.claim_token}::uuid
      AND status = 'SENDING'`);
}

export async function removeExpiredPushSubscription(subscriptionId: string) {
  await db.execute(
    sql`DELETE FROM public.push_subscriptions WHERE subscription_id = ${subscriptionId}::uuid`,
  );
}

export async function maintainPushQueue() {
  await db.execute(sql`UPDATE public.push_deliveries SET status = 'FAILED', locked_until = NULL,
    last_error = 'attempt_limit' WHERE status = 'SENDING' AND locked_until < now() AND attempts >= 5`);
  // Snapshots contain student names; keep delivery diagnostics for only 30 days.
  await db.execute(
    sql`DELETE FROM public.push_events WHERE created_at < now() - interval '30 days'`,
  );
}
