/**
 * In-App Notifications API
 *
 * Provides endpoints for managing in-app notifications (bell icon):
 * - GET (loader): List notifications with unread count
 * - PATCH (action): Mark single notification as read
 * - POST (action): Mark all notifications as read
 */
import type { Route } from "./+types/in-app-notifications";

import { data } from "react-router";

import { requireSameOrigin } from "~/core/lib/guards.server";
import { RequestBodyError, readBoundedJson } from "~/core/lib/request-body";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  requireAdminRole,
  requireNotificationsEnabled,
} from "~/features/admin/guards.server";

/**
 * GET: List in-app notifications (max 9) with unread count
 */
export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  await requireNotificationsEnabled(organizationId);

  // Get notifications (max 9, newest first)
  const [notificationResult, unreadResult] = await Promise.all([
    client
      .from("in_app_notifications")
      .select(
        `
      in_app_notification_id,
      message,
      template_type,
      is_read,
      created_at,
      notification_id
    `,
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(9),

    // Get unread count
    client
      .from("in_app_notifications")
      .select("in_app_notification_id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_read", false),
  ]);
  if (notificationResult.error || unreadResult.error) {
    return data(
      { error: "알림을 불러오지 못했습니다." },
      { status: 500, headers },
    );
  }
  const { data: notifications } = notificationResult;
  const { count: unreadCount } = unreadResult;

  return data(
    {
      notifications: notifications || [],
      unreadCount: unreadCount || 0,
    },
    { headers },
  );
}

/**
 * POST/PATCH: Mark notifications as read
 * - PATCH with in_app_notification_id: Mark single as read
 * - POST without id: Mark all as read
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "PATCH") {
    return data(null, { status: 405, headers: { Allow: "POST, PATCH" } });
  }
  requireSameOrigin(request);
  const [client, headers] = makeServerClient(request);
  const { organizationId, profileId } = await requireAdminRole(client);
  await requireNotificationsEnabled(organizationId);

  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return data({ error: error.message }, { status: error.status, headers });
    }
    throw error;
  }
  const in_app_notification_id =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).in_app_notification_id
      : undefined;
  if (
    request.method === "PATCH" &&
    (typeof in_app_notification_id !== "number" ||
      !Number.isSafeInteger(in_app_notification_id) ||
      in_app_notification_id < 1)
  ) {
    return data(
      { error: "올바른 알림 ID가 필요합니다." },
      { status: 400, headers },
    );
  }

  if (
    request.method === "PATCH" &&
    typeof in_app_notification_id === "number"
  ) {
    // Mark single notification as read
    const { error } = await client
      .from("in_app_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        read_by: profileId,
      })
      .eq("in_app_notification_id", in_app_notification_id)
      .eq("organization_id", organizationId);

    if (error) {
      return data(
        { error: "Failed to mark as read" },
        { status: 500, headers },
      );
    }

    return data({ success: true }, { headers });
  }

  // Mark all unread notifications as read
  const { error } = await client
    .from("in_app_notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      read_by: profileId,
    })
    .eq("organization_id", organizationId)
    .eq("is_read", false);

  if (error) {
    return data(
      { error: "Failed to mark all as read" },
      { status: 500, headers },
    );
  }

  return data({ success: true }, { headers });
}
