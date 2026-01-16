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

import makeServerClient from "~/core/lib/supa-client.server";
import { requireAdminRole } from "~/features/admin/guards.server";

/**
 * GET: List in-app notifications (max 9) with unread count
 */
export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);

  // Get notifications (max 9, newest first)
  const { data: notifications } = await client
    .from("in_app_notifications")
    .select(
      `
      in_app_notification_id,
      message,
      template_type,
      is_read,
      created_at,
      notification_id
    `
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(9);

  // Get unread count
  const { count: unreadCount } = await client
    .from("in_app_notifications")
    .select("in_app_notification_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("is_read", false);

  return data(
    {
      notifications: notifications || [],
      unreadCount: unreadCount || 0,
    },
    { headers }
  );
}

/**
 * POST/PATCH: Mark notifications as read
 * - PATCH with in_app_notification_id: Mark single as read
 * - POST without id: Mark all as read
 */
export async function action({ request }: Route.ActionArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId, user } = await requireAdminRole(client);

  const body = await request.json().catch(() => ({}));
  const { in_app_notification_id } = body as {
    in_app_notification_id?: number;
  };

  if (request.method === "PATCH" && in_app_notification_id) {
    // Mark single notification as read
    const { error } = await client
      .from("in_app_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
        read_by: user.id,
      })
      .eq("in_app_notification_id", in_app_notification_id)
      .eq("organization_id", organizationId);

    if (error) {
      return data({ error: "Failed to mark as read" }, { status: 500, headers });
    }

    return data({ success: true }, { headers });
  }

  // Mark all unread notifications as read
  const { error } = await client
    .from("in_app_notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      read_by: user.id,
    })
    .eq("organization_id", organizationId)
    .eq("is_read", false);

  if (error) {
    return data({ error: "Failed to mark all as read" }, { status: 500, headers });
  }

  return data({ success: true }, { headers });
}
