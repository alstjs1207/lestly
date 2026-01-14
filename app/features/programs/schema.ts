/**
 * Program Schema
 *
 * This file defines the database schema for programs (classes).
 * Programs belong to an organization and can have multiple schedules.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { anonRole, authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";
import { instructors } from "~/features/instructors/schema";
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
    instructor_id: bigint("instructor_id", { mode: "number" })
      .references(() => instructors.instructor_id, { onDelete: "set null" }),
    title: text().notNull(),
    subtitle: text(),
    description: text(),
    thumbnail_url: text("thumbnail_url"),
    status: programStatusEnum().notNull().default("DRAFT"),
    level: programLevelEnum(),
    price: doublePrecision(),
    // 공개 페이지용 필드
    slug: text().unique(),
    cover_image_url: text("cover_image_url"),
    location_type: text("location_type").default("offline"),
    location_address: text("location_address"),
    duration_minutes: integer("duration_minutes").default(120),
    total_sessions: integer("total_sessions").default(4),
    curriculum: jsonb().default([]),
    max_capacity: integer("max_capacity"),
    is_public: boolean("is_public").default(false),
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
    // RLS Policy: Public programs are viewable by anyone (anon + authenticated)
    pgPolicy("public-programs-select-policy", {
      for: "select",
      to: [anonRole, authenticatedRole],
      as: "permissive",
      using: sql`${table.is_public} = true AND ${table.status} = 'ACTIVE'`,
    }),
  ],
);
