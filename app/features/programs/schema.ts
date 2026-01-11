/**
 * Program Schema
 *
 * This file defines the database schema for programs (classes).
 * Programs belong to an organization and can have multiple schedules.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  doublePrecision,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";
import { organizations } from "~/features/organizations/schema";

/**
 * Program Status Enum
 * - DRAFT: Program is being set up
 * - ACTIVE: Program is currently active and accepting students
 * - ARCHIVED: Program is no longer active
 */
export const programStatusEnum = pgEnum("program_status", [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);

/**
 * Program Level Enum
 * - BEGINNER: Entry level
 * - INTERMEDIATE: Middle level
 * - ADVANCED: Expert level
 */
export const programLevelEnum = pgEnum("program_level", [
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
]);

/**
 * Programs Table
 *
 * Stores program (class) information.
 * Each program belongs to an organization and can have multiple schedules.
 */
export const programs = pgTable(
  "programs",
  {
    program_id: bigint("program_id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    title: text().notNull(),
    subtitle: text(),
    description: text(),
    instructor_name: text("instructor_name"),
    instructor_info: text("instructor_info"),
    thumbnail_url: text("thumbnail_url"),
    status: programStatusEnum().notNull().default("DRAFT"),
    level: programLevelEnum(),
    price: doublePrecision(),
    ...timestamps,
  },
  (table) => [
    // RLS Policy: Students can view active programs in their organization
    pgPolicy("student-select-active-programs-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`get_user_organization_id() = ${table.organization_id} AND ${table.status} = 'ACTIVE'`,
    }),
    // RLS Policy: Admin can view all programs in their organization
    pgPolicy("admin-select-org-programs-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can insert programs in their organization
    pgPolicy("admin-insert-org-programs-policy", {
      for: "insert",
      to: authenticatedRole,
      as: "permissive",
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can update programs in their organization
    pgPolicy("admin-update-org-programs-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can delete programs in their organization
    pgPolicy("admin-delete-org-programs-policy", {
      for: "delete",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
  ],
);
