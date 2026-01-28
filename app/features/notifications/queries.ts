/**
 * Notifications Queries
 *
 * This file contains functions for notification-specific queries.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

type NotificationType = "ALIMTALK" | "CONSULT_REQUEST";
type AlimtalkStatus = "PENDING" | "SENT" | "FAILED";
type ConsultStatus = "WAITING" | "COMPLETED";

/**
 * Get all notifications for an organization with pagination
 */
export async function getNotificationsPaginated(
  client: SupabaseClient<Database>,
  {
    organizationId,
    page = 1,
    pageSize = 20,
    typeFilter,
    statusFilter,
  }: {
    organizationId: string;
    page?: number;
    pageSize?: number;
    typeFilter?: NotificationType;
    statusFilter?: AlimtalkStatus | ConsultStatus;
  },
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (typeFilter) {
    query = query.eq("type", typeFilter);
  }

  if (statusFilter) {
    if (statusFilter === "PENDING" || statusFilter === "SENT" || statusFilter === "FAILED") {
      query = query.eq("alimtalk_status", statusFilter);
    } else {
      query = query.eq("consult_status", statusFilter);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  // super_templates 조회하여 템플릿 코드 → 이름 매핑 생성
  const { data: superTemplates } = await client
    .from("super_templates")
    .select("kakao_template_code, name");

  const templateNameMap = new Map(
    superTemplates?.map((t) => [t.kakao_template_code, t.name]) ?? []
  );

  // notifications에 template_name 추가
  const notificationsWithTemplateName = (data ?? []).map((notification) => ({
    ...notification,
    template_name: notification.alimtalk_template_code
      ? templateNameMap.get(notification.alimtalk_template_code) ??
        notification.alimtalk_template_code
      : null,
  }));

  return {
    notifications: notificationsWithTemplateName,
    totalCount: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / pageSize),
    currentPage: page,
  };
}

/**
 * Get a single notification by ID (with organization check)
 */
export async function getNotificationById(
  client: SupabaseClient<Database>,
  {
    organizationId,
    notificationId,
  }: { organizationId: string; notificationId: number },
) {
  const { data, error } = await client
    .from("notifications")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("notification_id", notificationId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update a consult notification (status, result, notes)
 */
export async function updateConsultNotification(
  client: SupabaseClient<Database>,
  {
    organizationId,
    notificationId,
    consultStatus,
    consultResult,
    consultNotes,
  }: {
    organizationId: string;
    notificationId: number;
    consultStatus?: ConsultStatus;
    consultResult?: "SUCCESS" | "FAILED";
    consultNotes?: string;
  },
) {
  const updates: Record<string, unknown> = {};

  if (consultStatus) {
    updates.consult_status = consultStatus;
    if (consultStatus === "COMPLETED") {
      updates.consult_completed_at = new Date().toISOString();
    }
  }

  if (consultResult) {
    updates.consult_result = consultResult;
  }

  if (consultNotes !== undefined) {
    updates.consult_notes = consultNotes;
  }

  const { data, error } = await client
    .from("notifications")
    .update(updates)
    .eq("organization_id", organizationId)
    .eq("notification_id", notificationId)
    .eq("type", "CONSULT_REQUEST")
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get templates with organization settings
 */
export async function getTemplatesWithOrgSettings(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  // Get all super templates
  const { data: superTemplates, error: superError } = await client
    .from("super_templates")
    .select("*")
    .eq("status", "ACTIVE")
    .order("super_template_id", { ascending: true });

  if (superError) {
    throw superError;
  }

  // Get organization templates
  const { data: orgTemplates, error: orgError } = await client
    .from("organization_templates")
    .select("*")
    .eq("organization_id", organizationId);

  if (orgError) {
    throw orgError;
  }

  // Merge templates with organization settings
  const templates = superTemplates?.map((superTemplate) => {
    const orgTemplate = orgTemplates?.find(
      (ot) => ot.super_template_id === superTemplate.super_template_id
    );

    return {
      ...superTemplate,
      orgSettings: orgTemplate ?? null,
    };
  });

  return templates ?? [];
}

/**
 * Upsert organization template settings
 */
export async function upsertOrgTemplate(
  client: SupabaseClient<Database>,
  {
    organizationId,
    superTemplateId,
    sendTiming,
    hoursBefore,
    scheduledSendTime,
    batchStartHour,
    status,
    alimtalkEnabled,
    emailEnabled,
  }: {
    organizationId: string;
    superTemplateId: number;
    sendTiming: "IMMEDIATE" | "SCHEDULED";
    hoursBefore?: number;
    scheduledSendTime?: string;
    batchStartHour?: number;
    status?: "ACTIVE" | "INACTIVE";
    alimtalkEnabled?: boolean;
    emailEnabled?: boolean;
  },
) {
  // Check if org template exists
  const { data: existing } = await client
    .from("organization_templates")
    .select("org_template_id")
    .eq("organization_id", organizationId)
    .eq("super_template_id", superTemplateId)
    .single();

  const templateData = {
    organization_id: organizationId,
    super_template_id: superTemplateId,
    send_timing: sendTiming,
    hours_before: hoursBefore ?? null,
    scheduled_send_time: scheduledSendTime ?? null,
    batch_start_hour: batchStartHour ?? 23,
    status: status ?? ("ACTIVE" as const),
    alimtalk_enabled: alimtalkEnabled ?? true,
    email_enabled: emailEnabled ?? true,
  };

  if (existing) {
    const { data, error } = await client
      .from("organization_templates")
      .update(templateData)
      .eq("org_template_id", existing.org_template_id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } else {
    const { data, error } = await client
      .from("organization_templates")
      .insert(templateData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }
}

/**
 * Get test send count for today
 */
export async function getTodayTestSendCount(
  client: SupabaseClient<Database>,
  {
    organizationId,
    profileId,
  }: { organizationId: string; profileId: string },
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await client
    .from("test_send_logs")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("profile_id", profileId)
    .gte("sent_at", today.toISOString());

  if (error) {
    throw error;
  }

  return count ?? 0;
}
