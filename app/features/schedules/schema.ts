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
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUid, authenticatedRole } from "drizzle-orm/supabase";

import { makeIdentityColumn, timestamps } from "~/core/db/helpers";
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
    ...makeIdentityColumn("schedule_id"),
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
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }).notNull(),
    // rrule.js format for recurring schedules (e.g., "FREQ=WEEKLY;BYDAY=MO")
    rrule: text(),
    // Reference to parent schedule for recurring schedule instances
    parent_schedule_id: bigint("parent_schedule_id", { mode: "number" }),
    // Whether this is an exception to a recurring schedule
    is_exception: boolean("is_exception").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    // RLS Policy: Students can view their own schedules (within same organization)
    pgPolicy("student-select-own-schedules-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${table.student_id} = ${authUid} AND is_same_organization(${table.organization_id})`,
    }),
    // RLS Policy: Students can insert their own schedules (within same organization)
    pgPolicy("student-insert-own-schedules-policy", {
      for: "insert",
      to: authenticatedRole,
      as: "permissive",
      withCheck: sql`${table.student_id} = ${authUid} AND is_same_organization(${table.organization_id})`,
    }),
    // RLS Policy: Students can delete their own schedules (not on the same day)
    pgPolicy("student-delete-own-schedules-policy", {
      for: "delete",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${table.student_id} = ${authUid} AND is_same_organization(${table.organization_id}) AND ${table.start_time}::date > CURRENT_DATE`,
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
);
