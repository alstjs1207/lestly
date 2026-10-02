/**
 * Organization Schema
 *
 * This file defines the database schema for organizations and organization members.
 * Organizations are the top-level entity that groups users, programs, and schedules.
 * Organization members define the N:N relationship between profiles and organizations.
 */
import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
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
 * - GRADUATE: 졸업 처리된 수강생
 * - DELETED: 탈퇴 처리된 수강생
 */
export const userStateEnum = pgEnum("user_state", [
  "NORMAL",
  "GRADUATE",
  "DELETED",
]);

/**
 * User Type Enum
 * - EXAMINEE: 입시생
 * - DROPPER: 재수생
 * - ADULT: 성인 수강생
 */
export const userTypeEnum = pgEnum("user_type", [
  "EXAMINEE",
  "DROPPER",
  "ADULT",
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
    type: userTypeEnum(),
    ...timestamps,
  },
  (table) => [
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
