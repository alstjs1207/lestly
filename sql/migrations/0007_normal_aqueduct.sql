CREATE TABLE "instructors" (
	"instructor_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "instructors_instructor_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"info" text,
	"photo_url" text,
	"career" jsonb DEFAULT '[]'::jsonb,
	"sns" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instructors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "instructor_id" bigint;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "cover_image_url" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "location_type" text DEFAULT 'offline';--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "location_address" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "duration_minutes" integer DEFAULT 120;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "total_sessions" integer DEFAULT 4;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "curriculum" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "max_capacity" integer;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "is_public" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_instructor_id_instructors_instructor_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("instructor_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "instructor_name";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "instructor_info";--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_slug_unique" UNIQUE("slug");--> statement-breakpoint
CREATE POLICY "public-programs-select-policy" ON "programs" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ("programs"."is_public" = true AND "programs"."status" = 'ACTIVE');--> statement-breakpoint
CREATE POLICY "admin-select-org-instructors-policy" ON "instructors" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_org_admin("instructors"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-insert-org-instructors-policy" ON "instructors" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_org_admin("instructors"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-update-org-instructors-policy" ON "instructors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (is_org_admin("instructors"."organization_id")) WITH CHECK (is_org_admin("instructors"."organization_id"));--> statement-breakpoint
CREATE POLICY "admin-delete-org-instructors-policy" ON "instructors" AS PERMISSIVE FOR DELETE TO "authenticated" USING (is_org_admin("instructors"."organization_id"));