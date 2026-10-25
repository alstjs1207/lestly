/**
 * User Profile Schema
 *
 * This file defines the database schema for user profiles and sets up
 * Supabase Row Level Security (RLS) policies to control data access.
 *
 * Note: Role, state, type, and organization membership are now managed
 * through the organization_members junction table for N:N relationship.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUid, authUsers, authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";
import {
  organizationMembers,
  organizations,
} from "~/features/organizations/schema";

/**
 * Profiles Table
 *
 * Stores additional user profile information beyond the core auth data.
 * profile_id is the stable domain identifier used by schedules and memberships.
 * auth_user_id is nullable so an admin can manage a student before the student
 * accepts an invitation and connects a login account.
 *
 * Organization membership, role, state, and type are managed through
 * the organization_members table (N:N relationship).
 *
 * Includes Row Level Security (RLS) policies to ensure users can only
 * access and modify their own profile data.
 */
export const profiles = pgTable(
  "profiles",
  {
    profile_id: uuid().primaryKey().defaultRandom(),
    auth_user_id: uuid("auth_user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    contact_email: text("contact_email"),
    name: text().notNull(),
    avatar_url: text(),
    marketing_consent: boolean("marketing_consent").notNull().default(false),
    region: text(),
    birth_date: date("birth_date"),
    description: text(),
    class_start_date: date("class_start_date"),
    class_end_date: date("class_end_date"),
    phone: text(),
    phone_normalized: text().generatedAlwaysAs(
      sql`nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')`,
    ),
    parent_name: text("parent_name"),
    parent_phone: text("parent_phone"),
    color: text().default("#3B82F6"),
    is_signup_complete: boolean("is_signup_complete").notNull().default(true),

    // Adds created_at and updated_at timestamp columns
    ...timestamps,
  },
  (table) => [
    index("profiles_phone_normalized_idx").on(table.phone_normalized),
    index("profiles_contact_email_idx")
      .on(sql`lower(${table.contact_email})`)
      .where(sql`${table.contact_email} IS NOT NULL`),
    pgPolicy("super-admin-all-profiles-policy", {
      for: "all",
      to: authenticatedRole,
      as: "permissive",
      using: sql`public.is_super_admin()`,
      withCheck: sql`public.is_super_admin()`,
    }),
    // RLS Policy: Users can only update their own profile
    pgPolicy("edit-profile-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      withCheck: sql`${authUid} = ${table.auth_user_id}`,
      using: sql`${authUid} = ${table.auth_user_id}`,
    }),
    // RLS Policy: Users can only delete their own profile
    pgPolicy("delete-profile-policy", {
      for: "delete",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${authUid} = ${table.auth_user_id}`,
    }),
    // RLS Policy: Users can only view their own profile
    pgPolicy("select-profile-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${authUid} = ${table.auth_user_id}`,
    }),
    // RLS Policy: ADMIN can view profiles of members in their organizations
    // Uses organization_members junction table
    pgPolicy("admin-select-org-member-profiles-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`EXISTS (
        SELECT 1 FROM organization_members target_membership
        WHERE target_membership.profile_id = ${table.profile_id}
        AND is_org_admin(target_membership.organization_id)
      )`,
    }),
    // RLS Policy: ADMIN can update profiles of members in their organizations
    pgPolicy("admin-update-org-member-profiles-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`EXISTS (
        SELECT 1 FROM organization_members target_membership
        WHERE target_membership.profile_id = ${table.profile_id}
        AND is_org_admin(target_membership.organization_id)
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM organization_members target_membership
        WHERE target_membership.profile_id = ${table.profile_id}
        AND is_org_admin(target_membership.organization_id)
      )`,
    }),
  ],
).enableRLS();

// Auth linking and claim/revocation are performed by the SQL claim RPC and
// authorized server routes. Browser clients only read their tenant's invites.
export const studentInvites = pgTable(
  "student_invites",
  {
    invite_id: uuid("invite_id").primaryKey().defaultRandom(),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.organization_id, { onDelete: "cascade" }),
    profile_id: uuid("profile_id")
      .notNull()
      .references(() => profiles.profile_id, { onDelete: "cascade" }),
    token_hash: text("token_hash").notNull().unique(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    used_at: timestamp("used_at", { withTimezone: true }),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    created_by_profile_id: uuid("created_by_profile_id")
      .notNull()
      .references(() => profiles.profile_id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "student_invites_expiry_after_creation",
      sql`${table.expires_at} > ${table.created_at}`,
    ),
    foreignKey({
      name: "student_invites_member_tenant_fk",
      columns: [table.organization_id, table.profile_id],
      foreignColumns: [
        organizationMembers.organization_id,
        organizationMembers.profile_id,
      ],
    }).onDelete("cascade"),
    index("student_invites_active_profile_idx")
      .on(table.profile_id, table.expires_at.desc())
      .where(sql`${table.used_at} IS NULL AND ${table.revoked_at} IS NULL`),
    pgPolicy("admin-select-student-invites-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`public.is_org_admin(${table.organization_id})`,
    }),
  ],
).enableRLS();

// Server-only revocation state. SQL migration 0024 manages grants and checks.
export const studentAccountAccess = pgTable("student_account_access", {
  profile_id: uuid()
    .primaryKey()
    .references(() => profiles.profile_id, { onDelete: "cascade" }),
  blocked: boolean().notNull().default(false),
  valid_after: bigint({ mode: "number" }).notNull().default(0),
}).enableRLS();
