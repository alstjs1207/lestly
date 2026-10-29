/**
 * Schedule Schema
 *
 * This file defines the database schema for schedules and sets up
 * Supabase Row Level Security (RLS) policies to control data access.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";
import { organizations } from "~/features/organizations/schema";
import { programs } from "~/features/programs/schema";
import { profiles } from "~/features/users/schema";

/**
 * Schedules Table
 *
 * Stores schedule information for students.
 * Each schedule has a start time, end time (3 hours fixed), and optional recurrence rule.
 */
export const schedules = pgTable(
  "schedules",
  {
    schedule_id: bigint("schedule_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Organization reference for multi-tenancy
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    // Program reference (optional)
    program_id: bigint("program_id", { mode: "number" }).references(
      () => programs.program_id,
      { onDelete: "set null" },
    ),
    student_id: uuid("student_id")
      .notNull()
      .references(() => profiles.profile_id, { onDelete: "cascade" }),
    cancellation_policy: jsonb("cancellation_policy")
      .notNull()
      .default(sql`'{"mode":"previous_day"}'::jsonb`),
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }).notNull(),
    // rrule.js format for recurring schedules (e.g., "FREQ=WEEKLY;BYDAY=MO")
    rrule: text(),
    // Reference to parent schedule for recurring schedule instances
    parent_schedule_id: bigint("parent_schedule_id", { mode: "number" }),
    // Whether this is an exception to a recurring schedule
    is_exception: boolean("is_exception").notNull().default(false),
    attendance_status: text("attendance_status").notNull().default("PENDING"),
    attendance_version: integer("attendance_version").notNull().default(0),
    attendance_updated_at: timestamp("attendance_updated_at", {
      withTimezone: true,
    }),
    attendance_updated_by: uuid("attendance_updated_by"),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("schedules_attendance_pending_idx")
      .on(table.organization_id, table.start_time, table.schedule_id)
      .where(sql`${table.attendance_status} = 'PENDING'`),
    check(
      "schedules_attendance_status_check",
      sql`${table.attendance_status} IN ('PENDING', 'PRESENT', 'ABSENT')`,
    ),
    check(
      "schedules_attendance_cancellation_check",
      sql`(${table.attendance_status} = 'ABSENT') = (${table.cancelled_at} IS NOT NULL)`,
    ),
    check(
      "schedules_attendance_version_check",
      sql`${table.attendance_version} >= 0`,
    ),
    // DEFERRABLE schedules_program_tenant_fk and eligibility triggers are
    // maintained in SQL; Drizzle cannot express deferred FK timing.
    unique("schedules_id_org_unique").on(
      table.schedule_id,
      table.organization_id,
    ),
    check(
      "schedules_valid_time_range",
      sql`${table.end_time} > ${table.start_time}`,
    ),
    index("schedules_org_start_idx").on(
      table.organization_id,
      table.start_time,
    ),
    index("schedules_lifecycle_idx").on(
      table.organization_id,
      table.student_id,
      table.start_time,
    ),
    index("schedules_student_start_idx").on(table.student_id, table.start_time),
    index("schedules_parent_idx")
      .on(table.parent_schedule_id)
      .where(sql`${table.parent_schedule_id} IS NOT NULL`),
    pgPolicy("super-admin-all-schedules-policy", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`public.is_super_admin()`,
      withCheck: sql`public.is_super_admin()`,
    }),
    // RLS Policy: Students can view their own schedules (within same organization)
    pgPolicy("student-select-own-schedules-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${table.student_id} = (SELECT public.get_current_profile_id()) AND (
        ${table.organization_id} = ANY ((SELECT public.get_account_org_ids('STUDENT', ARRAY['NORMAL']::public.user_state[]))::uuid[])
        OR (${table.end_time} <= now() AND ${table.organization_id} = ANY ((SELECT public.get_account_org_ids('STUDENT', ARRAY['GRADUATE']::public.user_state[]))::uuid[]))`,
    }),
    // Student creation uses book_student_schedule; no direct INSERT policy.
    // Students cancel using the immutable rule saved with each reservation.
    pgPolicy("student-delete-own-schedules-policy", {
      for: "delete",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${table.student_id} = public.get_current_profile_id() AND ${table.organization_id} = ANY ((SELECT public.get_account_org_ids('STUDENT', ARRAY['NORMAL']::public.user_state[]))::uuid[]) AND ${table.cancelled_at} IS NULL AND public.cancellation_allowed(${table.start_time}, ${table.cancellation_policy}, clock_timestamp())`,
    }),
    // RLS Policy: ADMIN can view schedules in their organization
    pgPolicy("admin-select-org-schedules-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: ADMIN can insert schedules in their organization
    pgPolicy("admin-insert-org-schedules-policy", {
      for: "insert",
      to: authenticatedRole,
      as: "permissive",
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: ADMIN can update schedules in their organization (future only)
    pgPolicy("admin-update-org-schedules-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id}) AND ${table.start_time}::date >= CURRENT_DATE`,
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: ADMIN can delete schedules in their organization (future only)
    pgPolicy("admin-delete-org-schedules-policy", {
      for: "delete",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id}) AND ${table.start_time}::date >= CURRENT_DATE`,
    }),
  ],
).enableRLS();
