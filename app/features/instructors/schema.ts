/**
 * Instructor Schema
 *
 * This file defines the database schema for instructors.
 * Instructors belong to an organization and can be assigned to programs.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { anonRole, authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";
import { organizations } from "~/features/organizations/schema";

/**
 * Instructors Table
 *
 * Stores instructor information.
 * Each instructor belongs to an organization.
 */
export const instructors = pgTable(
  "instructors",
  {
    instructor_id: bigint("instructor_id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    name: text().notNull(),
    info: text(),
    photo_url: text("photo_url"),
    career: jsonb().default([]),
    sns: jsonb().default({}),
    ...timestamps,
  },
  (table) => [
    unique("instructors_id_org_unique").on(
      table.instructor_id,
      table.organization_id,
    ),
    pgPolicy("public-program-instructor-select-policy", {
      for: "select",
      to: [anonRole, authenticatedRole],
      as: "permissive",
      using: sql`EXISTS (
        SELECT 1 FROM public.programs
        WHERE programs.instructor_id = ${table.instructor_id}
          AND programs.is_public = true AND programs.status = 'ACTIVE'
      )`,
    }),
    pgPolicy("student-select-active-program-instructors", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`public.is_org_member(${table.organization_id}) AND EXISTS (
        SELECT 1 FROM public.programs p WHERE p.instructor_id = ${table.instructor_id}
          AND p.organization_id = ${table.organization_id} AND (p.status = 'ACTIVE' OR EXISTS (
            SELECT 1 FROM public.schedules s WHERE s.program_id = p.program_id
              AND s.organization_id = p.organization_id AND s.student_id = public.get_current_profile_id()
          ))
      )`,
    }),
    // RLS Policy: Admin can view all instructors in their organization
    pgPolicy("admin-select-org-instructors-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can insert instructors in their organization
    pgPolicy("admin-insert-org-instructors-policy", {
      for: "insert",
      to: authenticatedRole,
      as: "permissive",
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can update instructors in their organization
    pgPolicy("admin-update-org-instructors-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can delete instructors in their organization
    pgPolicy("admin-delete-org-instructors-policy", {
      for: "delete",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
  ],
).enableRLS();
