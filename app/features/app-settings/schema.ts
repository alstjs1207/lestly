/**
 * App Settings Schema
 *
 * This file defines the database schema for application settings.
 * Settings are key-value pairs stored as JSONB for flexibility.
 * Settings are now scoped per organization for multi-tenancy.
 */
import { sql } from "drizzle-orm";
import {
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";
import { organizations } from "~/features/organizations/schema";

/**
 * Settings Table
 *
 * Stores organization-specific settings as key-value pairs.
 * - max_concurrent_students: Maximum number of students allowed in the same time slot
 * - schedule_duration_hours: Fixed duration for each schedule (default: 3 hours)
 * - time_slot_interval_minutes: Time slot interval (default: 30 minutes)
 */
export const settings = pgTable(
  "settings",
  {
    // Organization reference for multi-tenancy
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    setting_key: text("setting_key").notNull(),
    setting_value: jsonb("setting_value").notNull(),
    ...timestamps,
  },
  (table) => [
    // Composite primary key (organization_id, setting_key)
    primaryKey({ columns: [table.organization_id, table.setting_key] }),
    // RLS Policy: Users can read public settings in their organization
    pgPolicy("public-select-org-settings-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_member(${table.organization_id}) AND ${table.setting_key} IN ('max_concurrent_students', 'schedule_duration_hours', 'time_slot_interval_minutes')`,
    }),
    // RLS Policy: ADMIN can read all settings in their organization
    pgPolicy("admin-select-org-settings-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: ADMIN can update settings in their organization
    pgPolicy("admin-update-org-settings-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: ADMIN can insert settings in their organization
    pgPolicy("admin-insert-org-settings-policy", {
      for: "insert",
      to: authenticatedRole,
      as: "permissive",
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
  ],
);

/**
 * Setting Keys
 */
export const SETTING_KEYS = {
  MAX_CONCURRENT_STUDENTS: "max_concurrent_students",
  SCHEDULE_DURATION_HOURS: "schedule_duration_hours",
  TIME_SLOT_INTERVAL_MINUTES: "time_slot_interval_minutes",
  NOTIFICATIONS_ENABLED: "notifications_enabled",
} as const;

/**
 * Default Settings Values
 */
export const DEFAULT_SETTINGS = {
  [SETTING_KEYS.MAX_CONCURRENT_STUDENTS]: { value: 5 },
  [SETTING_KEYS.SCHEDULE_DURATION_HOURS]: { value: 3 },
  [SETTING_KEYS.TIME_SLOT_INTERVAL_MINUTES]: { value: 30 },
  [SETTING_KEYS.NOTIFICATIONS_ENABLED]: { value: false },
} as const;
