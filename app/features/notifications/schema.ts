/**
 * Notifications Schema
 *
 * This file defines the database schema for the notification system.
 * Includes notifications, templates, test logs, and in-app notifications.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { anonRole, authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";
import { organizations } from "~/features/organizations/schema";
import { profiles } from "~/features/users/schema";
import { programs } from "~/features/programs/schema";

// =============================================
// Enum Types
// =============================================

/**
 * Notification Type Enum
 * - ALIMTALK: Kakao AlimTalk
 * - CONSULT_REQUEST: Consultation request
 */
export const notificationTypeEnum = pgEnum("notification_type", [
  "ALIMTALK",
  "CONSULT_REQUEST",
]);

/**
 * AlimTalk Status Enum
 * - PENDING: Waiting for scheduled send
 * - SENT: Successfully sent
 * - FAILED: Failed to send
 */
export const alimtalkStatusEnum = pgEnum("alimtalk_status", [
  "PENDING",
  "SENT",
  "FAILED",
]);

/**
 * Consult Status Enum
 * - WAITING: Waiting for consultation
 * - COMPLETED: Consultation completed
 */
export const consultStatusEnum = pgEnum("consult_status", [
  "WAITING",
  "COMPLETED",
]);

/**
 * Consult Result Enum
 * - SUCCESS: Registration succeeded
 * - FAILED: Registration failed
 */
export const consultResultEnum = pgEnum("consult_result", [
  "SUCCESS",
  "FAILED",
]);

/**
 * Send Mode Enum
 * - TEST: Test mode (no charge)
 * - LIVE: Production mode
 */
export const sendModeEnum = pgEnum("send_mode", ["TEST", "LIVE"]);

/**
 * Template Channel Enum
 * - ALIMTALK: Kakao AlimTalk
 */
export const templateChannelEnum = pgEnum("template_channel", ["ALIMTALK"]);

/**
 * Template Status Enum
 * - ACTIVE: Currently in use
 * - INACTIVE: Not in use
 */
export const templateStatusEnum = pgEnum("template_status", [
  "ACTIVE",
  "INACTIVE",
]);

/**
 * Send Timing Enum
 * - IMMEDIATE: Send immediately
 * - SCHEDULED: Send at scheduled time
 */
export const sendTimingEnum = pgEnum("send_timing", ["IMMEDIATE", "SCHEDULED"]);

// =============================================
// Tables
// =============================================

/**
 * Notifications Table
 *
 * Stores all notification records including AlimTalk and consultation requests.
 */
export const notifications = pgTable(
  "notifications",
  {
    notification_id: bigint("notification_id", { mode: "number" })
      .primaryKey()
      .generatedByDefaultAsIdentity(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),

    // Notification type
    type: notificationTypeEnum().notNull(),

    // Recipient info
    recipient_phone: text("recipient_phone").notNull(),
    recipient_name: text("recipient_name"),
    recipient_profile_id: uuid("recipient_profile_id").references(
      () => profiles.profile_id,
      { onDelete: "set null" }
    ),

    // Sender/trigger info
    sender_profile_id: uuid("sender_profile_id").references(
      () => profiles.profile_id,
      { onDelete: "set null" }
    ),

    // AlimTalk fields
    alimtalk_status: alimtalkStatusEnum("alimtalk_status"),
    alimtalk_template_code: text("alimtalk_template_code"),
    alimtalk_variables: jsonb("alimtalk_variables"),
    alimtalk_message_id: text("alimtalk_message_id"),
    alimtalk_error_code: text("alimtalk_error_code"),
    alimtalk_error_message: text("alimtalk_error_message"),
    alimtalk_sent_at: timestamp("alimtalk_sent_at"),
    send_mode: sendModeEnum("send_mode"),

    // Consult request fields
    consult_status: consultStatusEnum("consult_status"),
    consult_result: consultResultEnum("consult_result"),
    consult_notes: text("consult_notes"),
    consult_message: text("consult_message"),
    consult_completed_at: timestamp("consult_completed_at"),
    consult_completed_by: uuid("consult_completed_by").references(
      () => profiles.profile_id,
      { onDelete: "set null" }
    ),

    // Retry/resend
    parent_notification_id: bigint("parent_notification_id", { mode: "number" }),
    retry_count: integer("retry_count").default(0),

    // Related entities (FK defined in migration SQL)
    schedule_id: bigint("schedule_id", { mode: "number" }),
    program_id: bigint("program_id", { mode: "number" }).references(
      () => programs.program_id,
      { onDelete: "set null" }
    ),

    // Scheduled send (STEP 6)
    scheduled_send_at: timestamp("scheduled_send_at"),
    reminder_generated: boolean("reminder_generated").default(false),

    ...timestamps,
  },
  (table) => [
    // Org admin can view all notifications
    pgPolicy("org_admin_select_notifications", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // Org admin can update consult notifications
    pgPolicy("org_admin_update_consult_notifications", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id}) AND ${table.type} = 'CONSULT_REQUEST'`,
      withCheck: sql`is_org_admin(${table.organization_id}) AND ${table.type} = 'CONSULT_REQUEST'`,
    }),
    // Anonymous can insert consultation requests
    pgPolicy("anon_insert_consult_notifications", {
      for: "insert",
      to: anonRole,
      as: "permissive",
      withCheck: sql`${table.type} = 'CONSULT_REQUEST'`,
    }),
    // Super admin has full access
    pgPolicy("super_admin_all_notifications", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_super_admin()`,
    }),
  ]
);

/**
 * Super Templates Table
 *
 * Master template definitions managed by super admin.
 */
export const superTemplates = pgTable(
  "super_templates",
  {
    super_template_id: bigint("super_template_id", { mode: "number" })
      .primaryKey()
      .generatedByDefaultAsIdentity(),

    // Template info
    name: text().notNull(),
    type: text().notNull(),
    channel: templateChannelEnum().notNull().default("ALIMTALK"),

    // Kakao AlimTalk info
    kakao_template_code: text("kakao_template_code").notNull().unique(),
    content: text().notNull(),

    // Variable metadata
    variables: jsonb().notNull().default([]),

    // Status
    status: templateStatusEnum().notNull().default("ACTIVE"),

    // Default settings
    default_timing: sendTimingEnum("default_timing").notNull(),
    default_hours_before: integer("default_hours_before"),

    ...timestamps,
  },
  () => [
    // Everyone can view templates
    pgPolicy("super_templates_select", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`true`,
    }),
    // Super admin has full access
    pgPolicy("super_templates_all", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_super_admin()`,
    }),
  ]
);

/**
 * Organization Templates Table
 *
 * Organization-specific template settings.
 */
export const organizationTemplates = pgTable(
  "organization_templates",
  {
    org_template_id: bigint("org_template_id", { mode: "number" })
      .primaryKey()
      .generatedByDefaultAsIdentity(),

    // Relations
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    super_template_id: bigint("super_template_id", { mode: "number" })
      .notNull()
      .references(() => superTemplates.super_template_id, {
        onDelete: "cascade",
      }),

    // Channel
    channel: templateChannelEnum().notNull().default("ALIMTALK"),

    // Status
    status: templateStatusEnum().notNull().default("ACTIVE"),

    // Send settings
    send_timing: sendTimingEnum("send_timing").notNull(),

    // Reminder settings (SYS_REMIND_STUDENT)
    hours_before: integer("hours_before"),

    // Batch send settings (ADM_BOOK/CANCEL)
    scheduled_send_time: time("scheduled_send_time"),
    batch_start_hour: integer("batch_start_hour").default(23),

    ...timestamps,
  },
  (table) => [
    // Org admin can view their org templates
    pgPolicy("org_templates_select", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // Org admin can update their org templates
    pgPolicy("org_templates_update", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // Org admin can insert their org templates
    pgPolicy("org_templates_insert", {
      for: "insert",
      to: authenticatedRole,
      as: "permissive",
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // Super admin has full access
    pgPolicy("org_templates_super_admin", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_super_admin()`,
    }),
  ]
);

/**
 * Test Send Logs Table
 *
 * Tracks test send history for daily limit enforcement.
 */
export const testSendLogs = pgTable(
  "test_send_logs",
  {
    log_id: bigint("log_id", { mode: "number" })
      .primaryKey()
      .generatedByDefaultAsIdentity(),
    organization_id: uuid("organization_id").references(
      () => organizations.organization_id,
      { onDelete: "cascade" }
    ), // NULL for super admin
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.profile_id, { onDelete: "cascade" }),
    super_template_id: bigint("super_template_id", { mode: "number" })
      .notNull()
      .references(() => superTemplates.super_template_id, {
        onDelete: "cascade",
      }),
    org_template_id: bigint("org_template_id", { mode: "number" }).references(
      () => organizationTemplates.org_template_id,
      { onDelete: "set null" }
    ),
    recipient_phone: text("recipient_phone").notNull(),
    sent_at: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [
    // Org admin can view their org logs
    pgPolicy("test_send_logs_select", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`(${table.organization_id} IS NOT NULL AND is_org_admin(${table.organization_id})) OR (${table.organization_id} IS NULL AND is_super_admin())`,
    }),
    // Super admin has full access
    pgPolicy("test_send_logs_super_admin", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_super_admin()`,
    }),
  ]
);

/**
 * In-App Notifications Table
 *
 * Stores in-app notifications for admin bell icon.
 */
export const inAppNotifications = pgTable(
  "in_app_notifications",
  {
    in_app_notification_id: bigint("in_app_notification_id", { mode: "number" })
      .primaryKey()
      .generatedByDefaultAsIdentity(),

    // Relations
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    notification_id: bigint("notification_id", { mode: "number" }).references(
      () => notifications.notification_id,
      { onDelete: "cascade" }
    ),

    // Content
    message: text().notNull(),
    template_type: text("template_type").notNull(),

    // Read status
    is_read: boolean("is_read").notNull().default(false),
    read_at: timestamp("read_at"),
    read_by: uuid("read_by").references(() => profiles.profile_id, {
      onDelete: "set null",
    }),

    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Org admin can view their org in-app notifications
    pgPolicy("in_app_notifications_select", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // Org admin can update (mark as read)
    pgPolicy("in_app_notifications_update", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // Super admin has full access
    pgPolicy("in_app_notifications_super_admin", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_super_admin()`,
    }),
  ]
);
