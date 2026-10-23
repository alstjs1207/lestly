-- Missing setting means every existing start time remains enabled.
-- Settings changes affect new student bookings only; existing schedules remain intact.
ALTER POLICY "public-select-org-settings-policy" ON public.settings USING (
  public.is_org_member(organization_id) AND setting_key IN (
    'max_concurrent_students', 'schedule_duration_hours', 'time_slot_interval_minutes',
    'disabled_booking_start_times'
  )
);
--> statement-breakpoint
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
    IF EXISTS (SELECT 1 FROM public.settings WHERE organization_id = NEW.organization_id
      AND setting_key = 'disabled_booking_start_times'
      AND (setting_value->'value') ? to_char(v_start, 'HH24:MI')) THEN
      RAISE EXCEPTION 'schedule_time_disabled';
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
CREATE OR REPLACE FUNCTION public.get_student_booking_availability(
  p_organization_id uuid, p_date date, p_hours integer
) RETURNS TABLE (start_time timestamptz, available boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid := public.get_current_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_max integer := 5;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_student IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members WHERE organization_id = p_organization_id
      AND profile_id = v_student AND role = 'STUDENT' AND state = 'NORMAL'
  ) THEN RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE = '42501'; END IF;
  IF p_date IS NULL OR p_hours IS NULL OR p_hours NOT IN (3,6,9)
    OR p_date < date_trunc('month',v_today)::date
    OR p_date >= (date_trunc('month',v_today) + CASE WHEN extract(day FROM v_today) >= 25 THEN interval '2 months' ELSE interval '1 month' END)::date
  THEN RAISE EXCEPTION 'schedule_date_not_allowed'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE profile_id = v_student;
  SELECT coalesce((setting_value->>'value')::integer,5) INTO v_max FROM public.settings
    WHERE organization_id = p_organization_id AND setting_key = 'max_concurrent_students';
  v_max := coalesce(v_max,5);
  RETURN QUERY
  WITH slots AS (
    SELECT ((p_date + time '09:00') + i * interval '30 minutes') AT TIME ZONE 'Asia/Seoul' AS slot
    FROM generate_series(0,22) AS i
  ), checks AS (
    SELECT slot, CASE
      WHEN EXISTS (SELECT 1 FROM public.settings WHERE organization_id = p_organization_id
        AND setting_key = 'disabled_booking_start_times'
        AND (setting_value->'value') ? to_char(slot AT TIME ZONE 'Asia/Seoul', 'HH24:MI')) THEN 'disabled'
      WHEN slot <= now() THEN 'past'
      WHEN (v_profile.class_start_date IS NOT NULL AND p_date < v_profile.class_start_date)
        OR (v_profile.class_end_date IS NOT NULL AND p_date > v_profile.class_end_date) THEN 'outside_course'
      WHEN EXISTS(SELECT 1 FROM public.schedules s WHERE s.student_id = v_student
        AND s.start_time < slot + make_interval(hours => p_hours) AND s.end_time > slot) THEN 'student_conflict'
      WHEN v_max < 1 OR (SELECT count(*) FROM public.schedules s WHERE s.organization_id = p_organization_id
        AND s.start_time < slot + make_interval(hours => p_hours) AND s.end_time > slot) >= v_max THEN 'capacity'
      ELSE NULL END AS unavailable_reason
    FROM slots
  ) SELECT slot, unavailable_reason IS NULL, unavailable_reason FROM checks ORDER BY slot;
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_booking_availability(uuid,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_booking_availability(uuid,date,integer) TO authenticated;
