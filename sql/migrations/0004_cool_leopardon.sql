CREATE TYPE "public"."program_level" AS ENUM('BEGINNER', 'INTERMEDIATE', 'ADVANCED');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "user_role" DEFAULT 'STUDENT' NOT NULL,
	"state" "user_state" DEFAULT 'NORMAL' NOT NULL,
	"type" "user_type",
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_profile_id_pk" PRIMARY KEY("organization_id","profile_id")
);
--> statement-breakpoint
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"organization_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "programs" (
	"program_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "programs_program_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"instructor_name" text,
	"instructor_info" text,
	"thumbnail_url" text,
	"status" "program_status" DEFAULT 'DRAFT' NOT NULL,
	"level" "program_level",
	"price" double precision,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_setting_key_pk" PRIMARY KEY("organization_id","setting_key")--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "organization_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "program_id" bigint;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_profile_id_users_id_fk" FOREIGN KEY ("profile_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_program_id_programs_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("program_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Create helper functions for RLS policies
CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE profile_id = auth.uid()
    AND organization_id = org_id
    AND state = 'NORMAL'
  );
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE profile_id = auth.uid()
    AND organization_id = org_id
    AND role = 'ADMIN'
    AND state = 'NORMAL'
  );
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.organization_members
  WHERE profile_id = auth.uid()
  AND state = 'NORMAL'
  LIMIT 1;
$$;--> statement-breakpoint

DROP POLICY IF EXISTS "public-select-settings-policy" ON "settings" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-select-all-settings-policy" ON "settings" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-update-settings-policy" ON "settings" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-insert-settings-policy" ON "settings" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-select-all-schedules-policy" ON "schedules" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-insert-all-schedules-policy" ON "schedules" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-update-all-schedules-policy" ON "schedules" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-delete-all-schedules-policy" ON "schedules" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-select-all-profiles-policy" ON "profiles" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-update-all-profiles-policy" ON "profiles" CASCADE;--> statement-breakpoint
DROP POLICY IF EXISTS "admin-insert-profiles-policy" ON "profiles" CASCADE;--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "type"--> statement-breakpoint
CREATE POLICY "public-select-org-settings-policy" ON "settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_org_member("settings"."organization_id") AND "settings"."setting_key" IN ('max_concurrent_students', 'schedule_duration_hours', 'time_slot_interval_minutes'));--> statement-breakpoint
CREATE POLICY "admin-select-org-settings-policy" ON "settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_org_admin("settings"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-update-org-settings-policy" ON "settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_org_admin("settings"."organization_id")) WITH CHECK (is_org_admin("settings"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-insert-org-settings-policy" ON "settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_org_admin("settings"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-select-org-schedules-policy" ON "schedules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_org_admin("schedules"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-insert-org-schedules-policy" ON "schedules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_org_admin("schedules"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-update-org-schedules-policy" ON "schedules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_org_admin("schedules"."organization_id") AND "schedules"."start_time"::date >= CURRENT_DATE) WITH CHECK (is_org_admin("schedules"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-delete-org-schedules-policy" ON "schedules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_org_admin("schedules"."organization_id") AND "schedules"."start_time"::date >= CURRENT_DATE);--> statement-breakpoint
CREATE POLICY "admin-select-org-member-profiles-policy" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.profile_id = auth.uid()
        AND om1.role = 'ADMIN'
        AND om1.state = 'NORMAL'
        AND om2.profile_id = "profiles"."profile_id"
      ));--> statement-breakpoint
CREATE POLICY "admin-update-org-member-profiles-policy" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.profile_id = auth.uid()
        AND om1.role = 'ADMIN'
        AND om1.state = 'NORMAL'
        AND om2.profile_id = "profiles"."profile_id"
      )) WITH CHECK (EXISTS (
        SELECT 1 FROM organization_members om1
        JOIN organization_members om2 ON om1.organization_id = om2.organization_id
        WHERE om1.profile_id = auth.uid()
        AND om1.role = 'ADMIN'
        AND om1.state = 'NORMAL'
        AND om2.profile_id = "profiles"."profile_id"
      ));--> statement-breakpoint
CREATE POLICY "select-own-membership-policy" ON "organization_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((select auth.uid()) = "organization_members"."profile_id");--> statement-breakpoint
CREATE POLICY "admin-select-org-memberships-policy" ON "organization_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_org_admin("organization_members"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-insert-org-memberships-policy" ON "organization_members" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_org_admin("organization_members"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-update-org-memberships-policy" ON "organization_members" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_org_admin("organization_members"."organization_id")) WITH CHECK (is_org_admin("organization_members"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-delete-org-memberships-policy" ON "organization_members" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_org_admin("organization_members"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-select-own-organization-policy" ON "organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_org_admin("organizations"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-update-own-organization-policy" ON "organizations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_org_admin("organizations"."organization_id")) WITH CHECK (is_org_admin("organizations"."organization_id"));--> statement-breakpoint
CREATE POLICY "user-select-own-organization-policy" ON "organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_org_member("organizations"."organization_id"));--> statement-breakpoint
CREATE POLICY "student-select-active-programs-policy" ON "programs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (get_user_organization_id() = "programs"."organization_id" AND "programs"."status" = 'ACTIVE');--> statement-breakpoint
CREATE POLICY "admin-select-org-programs-policy" ON "programs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_org_admin("programs"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-insert-org-programs-policy" ON "programs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_org_admin("programs"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-update-org-programs-policy" ON "programs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_org_admin("programs"."organization_id")) WITH CHECK (is_org_admin("programs"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-delete-org-programs-policy" ON "programs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_org_admin("programs"."organization_id"));--> statement-breakpoint
ALTER POLICY "student-select-own-schedules-policy" ON "schedules" TO authenticated USING ("schedules"."student_id" = (select auth.uid()) AND is_org_member("schedules"."organization_id"));--> statement-breakpoint
ALTER POLICY "student-insert-own-schedules-policy" ON "schedules" TO authenticated WITH CHECK ("schedules"."student_id" = (select auth.uid()) AND is_org_member("schedules"."organization_id"));--> statement-breakpoint
ALTER POLICY "student-delete-own-schedules-policy" ON "schedules" TO authenticated USING ("schedules"."student_id" = (select auth.uid()) AND is_org_member("schedules"."organization_id") AND "schedules"."start_time"::date > CURRENT_DATE);