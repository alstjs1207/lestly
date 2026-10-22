/**
 * Super Admin Queries
 *
 * This file contains functions for super admin specific queries.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { fetchAllRows } from "../../core/lib/query-utils.ts";

type SendTiming = Database["public"]["Enums"]["send_timing"];
type TemplateStatus = Database["public"]["Enums"]["template_status"];

/** Get organization summaries in one query instead of three requests per org. */
export async function getOrganizationsWithStats(
  client: SupabaseClient<Database>,
) {
  const organizations = await fetchAllRows((from, to) =>
    client
      .from("organizations")
      .select(
        `
      *,
      members:organization_members(count),
      lessons:schedules(count),
      settings(setting_value)
    `,
      )
      .eq("settings.setting_key", "notifications_enabled")
      .order("created_at", { ascending: false })
      .order("organization_id", { ascending: true })
      .range(from, to),
  );

  return organizations.map(
    ({ members, lessons, settings, ...organization }) => ({
      ...organization,
      memberCount: members[0]?.count ?? 0,
      scheduleCount: lessons[0]?.count ?? 0,
      notificationsEnabled:
        (settings[0]?.setting_value as { value?: boolean } | null)?.value ===
        true,
    }),
  );
}

/**
 * Get all super templates (master templates)
 */
export async function getAllSuperTemplates(client: SupabaseClient<Database>) {
  const { data, error } = await client
    .from("super_templates")
    .select("*")
    .order("super_template_id", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Update a super template
 */
export async function updateSuperTemplate(
  client: SupabaseClient<Database>,
  {
    superTemplateId,
    name,
    kakaoTemplateCode,
    content,
    variables,
    defaultTiming,
    defaultHoursBefore,
    status,
  }: {
    superTemplateId: number;
    name?: string;
    kakaoTemplateCode?: string;
    content?: string;
    variables?: string[];
    defaultTiming?: SendTiming;
    defaultHoursBefore?: number | null;
    status?: TemplateStatus;
  },
) {
  const updates: Database["public"]["Tables"]["super_templates"]["Update"] = {};

  if (name !== undefined) {
    updates.name = name;
  }

  if (kakaoTemplateCode !== undefined) {
    updates.kakao_template_code = kakaoTemplateCode;
  }

  if (content !== undefined) {
    updates.content = content;
  }

  if (variables !== undefined) {
    updates.variables = variables;
  }

  if (defaultTiming !== undefined) {
    updates.default_timing = defaultTiming;
  }

  if (defaultHoursBefore !== undefined) {
    updates.default_hours_before = defaultHoursBefore;
  }

  if (status !== undefined) {
    updates.status = status;
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from("super_templates")
    .update(updates)
    .eq("super_template_id", superTemplateId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
