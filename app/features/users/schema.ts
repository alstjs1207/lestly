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
  boolean,
  date,
  pgPolicy,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { authUid, authUsers, authenticatedRole } from "drizzle-orm/supabase";

import { timestamps } from "~/core/db/helpers";

/**
 * Profiles Table
 *
 * Stores additional user profile information beyond the core auth data.
 * Links to Supabase auth.users table via profile_id foreign key.
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
    // Primary key that references the Supabase auth.users id
    // Using CASCADE ensures profile is deleted when user is deleted
    profile_id: uuid()
      .primaryKey()
      .references(() => authUsers.id, {
        onDelete: "cascade",
      }),
    name: text().notNull(),
    avatar_url: text(),
    marketing_consent: boolean("marketing_consent").notNull().default(false),
    region: text(),
    birth_date: date("birth_date"),
    description: text(),
    class_start_date: date("class_start_date"),
    class_end_date: date("class_end_date"),
    phone: text(),
    parent_name: text("parent_name"),
    parent_phone: text("parent_phone"),
    color: text().default("#3B82F6"),
    is_signup_complete: boolean("is_signup_complete").notNull().default(true),

    // Adds created_at and updated_at timestamp columns
    ...timestamps,
  },
  (table) => [
    // RLS Policy: Users can only update their own profile
    pgPolicy("edit-profile-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      withCheck: sql`${authUid} = ${table.profile_id}`,
      using: sql`${authUid} = ${table.profile_id}`,
    }),
    // RLS Policy: Users can only delete their own profile
    pgPolicy("delete-profile-policy", {
      for: "delete",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${authUid} = ${table.profile_id}`,
    }),
    // RLS Policy: Users can only view their own profile
    pgPolicy("select-profile-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`${authUid} = ${table.profile_id}`,
    }),
    // RLS Policy: ADMIN can view profiles of members in their organizations
    // Uses organization_members junction table
    pgPolicy("admin-select-org-member-profiles-policy", {
      for: "select",
      to: authenticatedRole,
      as: "permissive",
      using: sql`EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.profile_id = auth.uid()
        AND om1.role = 'ADMIN'
        AND om1.state = 'NORMAL'
        AND om2.profile_id = ${table.profile_id}
      )`,
    }),
    // RLS Policy: ADMIN can update profiles of members in their organizations
    pgPolicy("admin-update-org-member-profiles-policy", {
      for: "update",
      to: authenticatedRole,
      as: "permissive",
      using: sql`EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.profile_id = auth.uid()
        AND om1.role = 'ADMIN'
        AND om1.state = 'NORMAL'
        AND om2.profile_id = ${table.profile_id}
      )`,
      withCheck: sql`EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.profile_id = auth.uid()
        AND om1.role = 'ADMIN'
        AND om1.state = 'NORMAL'
        AND om2.profile_id = ${table.profile_id}
      )`,
    }),
  ],
);
