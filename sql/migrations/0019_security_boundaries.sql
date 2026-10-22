-- Restrict self-service profile edits to the fields exposed in account settings.
CREATE OR REPLACE FUNCTION public.protect_profile_management_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN RETURN NEW; END IF;
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'profile_identity_update_not_allowed' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.profile_id = OLD.profile_id AND om.role = 'STUDENT'
      AND public.is_org_admin(om.organization_id)
  ) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - ARRAY['name','avatar_url','marketing_consent','updated_at','phone_normalized'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['name','avatar_url','marketing_consent','updated_at','phone_normalized']) THEN
    RAISE EXCEPTION 'profile_management_update_not_allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER protect_profile_management_fields BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_management_fields();
REVOKE ALL ON FUNCTION public.protect_profile_management_fields() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint

-- Serialize bookings by tenant and student. The check and INSERT/UPDATE run in
-- the same transaction, including admin and service writes (not just the UI).
CREATE OR REPLACE FUNCTION public.guard_schedule_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_max integer := 5;
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_start timestamp := NEW.start_time AT TIME ZONE 'Asia/Seoul';
  v_profile public.profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || NEW.organization_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || NEW.student_id::text, 0));
  IF NEW.end_time <= NEW.start_time OR NOT isfinite(NEW.start_time) OR NOT isfinite(NEW.end_time) THEN
    RAISE EXCEPTION 'schedule_invalid_interval';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'schedule_identity_update_not_allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = NEW.organization_id AND om.profile_id = NEW.student_id
      AND om.role = 'STUDENT' AND om.state = 'NORMAL') THEN
    RAISE EXCEPTION 'schedule_student_not_eligible';
  END IF;
  IF NEW.program_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.programs p
    WHERE p.program_id = NEW.program_id AND p.organization_id = NEW.organization_id AND p.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'schedule_program_not_eligible';
  END IF;
  IF NEW.parent_schedule_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.schedules s
    WHERE s.schedule_id = NEW.parent_schedule_id AND s.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'schedule_parent_not_eligible';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_admin(NEW.organization_id) AND NOT public.is_super_admin() THEN
    IF NEW.student_id <> public.get_current_profile_id() OR TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NEW.start_time < now() OR v_start::date < date_trunc('month',v_today)::date
      OR v_start::date >= (date_trunc('month',v_today) +
        CASE WHEN extract(day FROM v_today) >= 25 THEN interval '2 months' ELSE interval '1 month' END)::date THEN
      RAISE EXCEPTION 'schedule_date_not_allowed';
    END IF;
    IF v_start::time < time '09:00' OR v_start::time > time '20:00'
      OR extract(minute FROM v_start)::int NOT IN (0,30) OR extract(second FROM v_start) <> 0
      OR extract(epoch FROM (NEW.end_time - NEW.start_time)) NOT IN (10800,21600,32400) THEN
      RAISE EXCEPTION 'schedule_time_not_allowed';
    END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE profile_id = NEW.student_id;
    IF (v_profile.class_start_date IS NOT NULL AND v_start::date < v_profile.class_start_date)
      OR (v_profile.class_end_date IS NOT NULL AND v_start::date > v_profile.class_end_date) THEN
      RAISE EXCEPTION 'schedule_outside_course';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedules s WHERE s.student_id = NEW.student_id
    AND s.schedule_id IS DISTINCT FROM NEW.schedule_id
    AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time) THEN
    RAISE EXCEPTION 'schedule_student_conflict';
  END IF;
  SELECT coalesce((setting_value->>'value')::integer,5) INTO v_max FROM public.settings
    WHERE organization_id = NEW.organization_id AND setting_key = 'max_concurrent_students';
  v_max := coalesce(v_max,5);
  IF v_max < 1 OR (SELECT count(*) FROM public.schedules s
    WHERE s.organization_id = NEW.organization_id AND s.schedule_id IS DISTINCT FROM NEW.schedule_id
      AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time) >= v_max THEN
    RAISE EXCEPTION 'schedule_capacity_exceeded';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_schedule_write BEFORE INSERT OR UPDATE OF organization_id,student_id,program_id,start_time,end_time,parent_schedule_id
ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_write();
REVOKE ALL ON FUNCTION public.guard_schedule_write() FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "student-insert-own-schedules-policy" ON public.schedules;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.book_student_schedule(
  p_organization_id uuid, p_program_id bigint, p_start_time timestamptz, p_end_time timestamptz
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_student uuid := public.get_current_profile_id(); v_id bigint;
BEGIN
  IF auth.uid() IS NULL OR v_student IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members WHERE organization_id = p_organization_id
      AND profile_id = v_student AND role = 'STUDENT' AND state = 'NORMAL'
  ) THEN RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.schedules(organization_id,student_id,program_id,start_time,end_time)
    VALUES(p_organization_id,v_student,p_program_id,p_start_time,p_end_time) RETURNING schedule_id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.book_student_schedule(uuid,bigint,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_student_schedule(uuid,bigint,timestamptz,timestamptz) TO authenticated;
--> statement-breakpoint
-- Match cancellation dates to the application's KST rule.
ALTER POLICY "student-delete-own-schedules-policy" ON public.schedules USING (
 student_id = public.get_current_profile_id() AND public.is_org_member(organization_id)
 AND (start_time AT TIME ZONE 'Asia/Seoul')::date > (now() AT TIME ZONE 'Asia/Seoul')::date
);
--> statement-breakpoint
