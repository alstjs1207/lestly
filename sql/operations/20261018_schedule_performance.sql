-- Online performance rollout for production schema 0015.
-- Run each statement-breakpoint block separately, outside an outer transaction.
-- This is only the performance subset of preview migration 0016. Do NOT mark
-- 0016 applied in drizzle.__drizzle_migrations: its other changes are pending.
-- Identical index names and RPC signature allow that migration to run later.
SET lock_timeout = '3s';
SET statement_timeout = '60s';
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS organization_members_profile_org_idx
  ON public.organization_members (profile_id, organization_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS schedules_org_start_idx
  ON public.schedules (organization_id, start_time);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS schedules_student_start_idx
  ON public.schedules (student_id, start_time);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS schedules_parent_idx
  ON public.schedules (parent_schedule_id)
  WHERE parent_schedule_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS programs_instructor_idx
  ON public.programs (instructor_id)
  WHERE instructor_id IS NOT NULL;
--> statement-breakpoint
BEGIN;
CREATE OR REPLACE FUNCTION public.get_student_total_hours(
  p_student_ids uuid[], p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (student_id uuid, total_hours double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT s.student_id,
         SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0)::double precision
  FROM public.schedules s
  WHERE s.student_id = ANY(p_student_ids)
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
    AND s.start_time <= now()
    AND s.end_time > s.start_time
  GROUP BY s.student_id;
$$;
REVOKE ALL ON FUNCTION public.get_student_total_hours(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_total_hours(uuid[], uuid)
  TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
--> statement-breakpoint
ANALYZE public.organization_members;
ANALYZE public.schedules;
ANALYZE public.programs;
