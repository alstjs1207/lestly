-- Completed schedule hours are distinct from attendance or accredited hours.
CREATE OR REPLACE FUNCTION public.get_student_completed_hours(
  p_student_ids uuid[], p_organization_id uuid DEFAULT NULL
) RETURNS TABLE (student_id uuid, total_hours double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT s.student_id,
    SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0)::double precision
  FROM public.schedules s
  WHERE s.student_id = ANY(p_student_ids)
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
    AND s.end_time <= now() AND s.end_time > s.start_time
  GROUP BY s.student_id;
$$;
REVOKE ALL ON FUNCTION public.get_student_completed_hours(uuid[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_completed_hours(uuid[],uuid) TO authenticated, service_role;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_student_total_hours(
  p_student_ids uuid[], p_organization_id uuid DEFAULT NULL
) RETURNS TABLE (student_id uuid, total_hours double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT * FROM public.get_student_completed_hours(p_student_ids,p_organization_id);
$$;
--> statement-breakpoint
-- Only availability flags are exposed; no other student's schedule or identity
-- leaves this function. The INSERT trigger remains the final, serialized check.
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
--> statement-breakpoint
-- Members can read instructor information for their active classes.
CREATE POLICY "student-select-active-program-instructors" ON public.instructors
FOR SELECT TO authenticated USING (
  public.is_org_member(organization_id) AND EXISTS (
    SELECT 1 FROM public.programs p WHERE p.instructor_id = instructors.instructor_id
      AND p.organization_id = instructors.organization_id AND p.status = 'ACTIVE'
  )
);
--> statement-breakpoint
-- Keep the class name and location readable for the student's own history even
-- after an administrator archives the class. Unrelated archived classes stay private.
CREATE POLICY "student-select-scheduled-programs" ON public.programs
FOR SELECT TO authenticated USING (
  public.is_org_member(organization_id) AND EXISTS (
    SELECT 1 FROM public.schedules s WHERE s.program_id = programs.program_id
      AND s.organization_id = programs.organization_id
      AND s.student_id = public.get_current_profile_id()
  )
);
--> statement-breakpoint
ALTER POLICY "student-select-active-program-instructors" ON public.instructors USING (
  public.is_org_member(organization_id) AND EXISTS (
    SELECT 1 FROM public.programs p WHERE p.instructor_id = instructors.instructor_id
      AND p.organization_id = instructors.organization_id AND (
        p.status = 'ACTIVE' OR EXISTS (
          SELECT 1 FROM public.schedules s WHERE s.program_id = p.program_id
            AND s.organization_id = p.organization_id
            AND s.student_id = public.get_current_profile_id()
        )
      )
  )
);
