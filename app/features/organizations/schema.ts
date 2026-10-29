/**
 * Organization Schema
 *
 * This file defines the database schema for organizations and organization members.
 * Organizations are the top-level entity that groups users, programs, and schedules.
 * Organization members define the N:N relationship between profiles and organizations.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUid, authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";
import { profiles } from "~/features/users/schema";

/**
 * User Role Enum
 * - STUDENT: 수강생 (일반 사용자)
 * - ADMIN: 관리자
 */
export const userRoleEnum = pgEnum("user_role", ["STUDENT", "ADMIN"]);

/**
 * User State Enum
 * - NORMAL: 정상 수강 중인 수강생
 * - GRADUATE: 수강 종료 처리된 수강생
 * - DELETED: 탈퇴 처리된 수강생
 */
export const userStateEnum = pgEnum("user_state", [
  "NORMAL",
  "GRADUATE",
  "DELETED",
]);

/**
 * Organizations Table
 *
 * Stores organization information for multi-tenancy support.
 * Each organization has its own set of users, programs, schedules, and settings.
 */
export const organizations = pgTable(
  "organizations",
  {
    organization_id: uuid("organization_id").primaryKey().defaultRandom(),
    name: text().notNull(),
    description: text(),
    ...timestamps,
  },
  (table) => [
    pgPolicy("super-admin-all-organizations-policy", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`public.is_super_admin()`,
      withCheck: sql`public.is_super_admin()`,
    }),
    // RLS Policy: Admin can view their own organization
    pgPolicy("admin-select-own-organization-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can update their own organization
    pgPolicy("admin-update-own-organization-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Users can view their own organization
    pgPolicy("user-select-own-organization-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_member(${table.organization_id})`,
    }),
  ],
).enableRLS();

/**
 * Organization Members Table
 *
 * Junction table for N:N relationship between profiles and organizations.
 * Each member can have a different role/state in each organization.
 * A user can be ADMIN in one org and STUDENT in another.
 */
// Stable text codes keep membership assignments intact when labels change.
export const organizationStudentTypes = pgTable(
  "organization_student_types",
  {
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    code: text().notNull(),
    label: text().notNull(),
    sort_order: integer().notNull().default(0),
    is_active: boolean().notNull().default(true),
    is_default: boolean().notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.organization_id, table.code] }),
    index("organization_student_types_order_idx").on(
      table.organization_id,
      table.sort_order,
      table.code,
    ),
    check(
      "organization_student_types_sort_order_check",
      sql`${table.sort_order} BETWEEN 0 AND 49`,
    ),
    check(
      "student_type_default_active",
      sql`NOT ${table.is_default} OR ${table.is_active}`,
    ),
    check(
      "organization_student_types_code_check",
      sql`length(btrim(${table.code})) BETWEEN 1 AND 80`,
    ),
    check(
      "organization_student_types_label_check",
      sql`length(btrim(${table.label})) BETWEEN 1 AND 80`,
    ),
    pgPolicy("members-select-student-types", {
      for: "select",
      to: authenticatedRole,
      using: sql`public.is_org_member(${table.organization_id}) OR public.is_super_admin()`,
    }),
  ],
).enableRLS();

export const organizationMembers = pgTable(
  "organization_members",
  {
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.profile_id, { onDelete: "cascade" }),
    role: userRoleEnum().notNull().default("STUDENT"),
    state: userStateEnum().notNull().default("NORMAL"),
    type: text(),
    student_phone: text(),
    ...timestamps,
  },
  (table) => [
    // SQL marks this composite FK DEFERRABLE; Drizzle cannot express that timing.
    foreignKey({
      name: "organization_members_student_type_fk",
      columns: [table.organization_id, table.type],
      foreignColumns: [
        organizationStudentTypes.organization_id,
        organizationStudentTypes.code,
      ],
    }),
    uniqueIndex("organization_student_phone_unique")
      .on(table.organization_id, table.student_phone)
      .where(
        sql`${table.role} = 'STUDENT' AND ${table.student_phone} IS NOT NULL`,
      ),
    // Composite primary key
    index("organization_members_profile_org_idx").on(
      table.profile_id,
      table.organization_id,
    ),
    pgPolicy("super-admin-all-org-members-policy", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`public.is_super_admin()`,
      withCheck: sql`public.is_super_admin()`,
    }),
    primaryKey({ columns: [table.organization_id, table.profile_id] }),
    // RLS Policy: Users can view their own memberships
    pgPolicy("select-own-membership-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.profile_id = ${table.profile_id}
        AND profiles.auth_user_id = ${authUid}
      )`,
    }),
    // RLS Policy: Admin can view all memberships in their organization
    pgPolicy("admin-select-org-memberships-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can update memberships in their organization
    pgPolicy("admin-update-org-memberships-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
      withCheck: sql`is_org_admin(${table.organization_id})`,
    }),
    // RLS Policy: Admin can delete memberships in their organization
    pgPolicy("admin-delete-org-memberships-policy", {
      for: "delete",
      to: authenticatedRole,
      as: "permissive",
      using: sql`is_org_admin(${table.organization_id})`,
    }),
  ],
).enableRLS();
