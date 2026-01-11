CREATE TYPE "public"."user_role" AS ENUM('STUDENT', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_state" AS ENUM('NORMAL', 'GRADUATE', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."user_type" AS ENUM('EXAMINEE', 'DROPPER', 'ADULT');--> statement-breakpoint
CREATE TABLE "settings" (
	"setting_key" text PRIMARY KEY NOT NULL,
	"setting_value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schedules" (
	"schedule_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "schedules_schedule_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"student_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"rrule" text,
	"parent_schedule_id" bigint,
	"is_exception" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "role" "user_role" DEFAULT 'STUDENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "state" "user_state" DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "type" "user_type";--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "class_start_date" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "class_end_date" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "parent_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "parent_phone" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "color" text DEFAULT '#3B82F6';--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_student_id_profiles_profile_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "admin-select-all-profiles-policy" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN'));--> statement-breakpoint
CREATE POLICY "admin-update-all-profiles-policy" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN')) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN'));--> statement-breakpoint
CREATE POLICY "admin-insert-profiles-policy" ON "profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN'));--> statement-breakpoint
CREATE POLICY "student-select-own-schedules-policy" ON "schedules" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("schedules"."student_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "student-insert-own-schedules-policy" ON "schedules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("schedules"."student_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "student-delete-own-schedules-policy" ON "schedules" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("schedules"."student_id" = (select auth.uid()) AND "schedules"."start_time"::date > CURRENT_DATE);--> statement-breakpoint
CREATE POLICY "admin-select-all-schedules-policy" ON "schedules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN'));--> statement-breakpoint
CREATE POLICY "admin-insert-all-schedules-policy" ON "schedules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN'));--> statement-breakpoint
CREATE POLICY "admin-update-all-schedules-policy" ON "schedules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN') AND "schedules"."start_time"::date >= CURRENT_DATE) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN'));--> statement-breakpoint
CREATE POLICY "admin-delete-all-schedules-policy" ON "schedules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (EXISTS (SELECT 1 FROM profiles WHERE profile_id = (select auth.uid()) AND role = 'ADMIN') AND "schedules"."start_time"::date >= CURRENT_DATE);