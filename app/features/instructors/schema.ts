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
  uuid,
} from "drizzle-orm/pg-core";
import { authenticatedRole } from "drizzle-orm/supabase";

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
    instructor_id: bigint("instructor_id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
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
);
