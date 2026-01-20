/**
 * Super Admin Queries
 *
 * This file contains functions for super admin specific queries.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

type SendTiming = Database["public"]["Enums"]["send_timing"];
type TemplateStatus = Database["public"]["Enums"]["template_status"];

/**
 * Get all super templates (master templates)
 */
export async function getAllSuperTemplates(
  client: SupabaseClient<Database>,
) {
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
  const updates: Record<string, unknown> = {};

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
