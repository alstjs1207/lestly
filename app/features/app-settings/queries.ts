/**
 * App Settings Queries
 *
 * This file contains functions for querying and updating application settings.
 * Settings are now scoped per organization for multi-tenancy.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "database.types";

import { DEFAULT_SETTINGS, SETTING_KEYS } from "./schema";

type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * Get a single setting by key for an organization
 */
export async function getSetting(
  client: SupabaseClient<Database>,
  {
    organizationId,
    key,
  }: {
    organizationId: string;
    key: SettingKey;
  },
) {
  const { data, error } = await client
    .from("settings")
    .select("setting_value")
    .eq("organization_id", organizationId)
    .eq("setting_key", key)
    .single();

  if (error || !data) {
    // Return default value if setting doesn't exist
    return DEFAULT_SETTINGS[key] || { value: null };
  }

  return data.setting_value as { value: number };
}

/**
 * Get all settings for an organization
 */
export async function getAllSettings(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const { data, error } = await client
    .from("settings")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update a setting value for an organization
 */
export async function updateSetting(
  client: SupabaseClient<Database>,
  {
    organizationId,
    key,
    value,
  }: {
    organizationId: string;
    key: SettingKey;
    value: { value: number };
  },
) {
  const { data, error } = await client
    .from("settings")
    .upsert({
      organization_id: organizationId,
      setting_key: key,
      setting_value: value,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Initialize default settings for a new organization
 */
export async function initializeDefaultSettings(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const settingsToInsert = Object.entries(DEFAULT_SETTINGS).map(
    ([key, value]) => ({
      organization_id: organizationId,
      setting_key: key,
      setting_value: value,
    }),
  );

  const { error } = await client.from("settings").upsert(settingsToInsert);

  if (error) {
    throw error;
  }
}

/**
 * Get max concurrent students setting for an organization
 */
export async function getMaxConcurrentStudents(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const setting = await getSetting(client, {
    organizationId,
    key: SETTING_KEYS.MAX_CONCURRENT_STUDENTS,
  });
  return setting.value ?? 5;
}

/**
 * Get schedule duration hours setting for an organization
 */
export async function getScheduleDurationHours(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const setting = await getSetting(client, {
    organizationId,
    key: SETTING_KEYS.SCHEDULE_DURATION_HOURS,
  });
  return setting.value ?? 3;
}

/**
 * Get time slot interval minutes setting for an organization
 */
export async function getTimeSlotIntervalMinutes(
  client: SupabaseClient<Database>,
  { organizationId }: { organizationId: string },
) {
  const setting = await getSetting(client, {
    organizationId,
    key: SETTING_KEYS.TIME_SLOT_INTERVAL_MINUTES,
  });
  return setting.value ?? 30;
}
