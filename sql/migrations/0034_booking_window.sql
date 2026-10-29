-- Phase 4. No settings, profiles or reservations are rewritten.
ALTER POLICY "public-select-org-settings-policy" ON public.settings USING (
 public.is_org_member(organization_id) AND setting_key IN ('max_concurrent_students','schedule_duration_hours','time_slot_interval_minutes','disabled_booking_start_times','disabled_booking_weekdays','booking_policy','booking_window')
);
--> statement-breakpoint
CREATE FUNCTION public.validate_booking_window(w jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(w) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_booking_window' USING ERRCODE='22023'; END IF;
 IF w->>'mode'='monthly' THEN
   IF NOT w ?& ARRAY['mode','openingDay'] OR w-ARRAY['mode','openingDay'] <> '{}'::jsonb
     OR jsonb_typeof(w->'openingDay') IS DISTINCT FROM 'number' OR coalesce(w->>'openingDay','') !~ '^[0-9]{1,3}$'
     THEN RAISE EXCEPTION 'invalid_booking_window' USING ERRCODE='22023'; END IF;
   IF (w->>'openingDay')::int NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'invalid_booking_window' USING ERRCODE='22023'; END IF;
 ELSIF w->>'mode'='rolling' THEN
   IF NOT w ?& ARRAY['mode','daysAhead'] OR w-ARRAY['mode','daysAhead'] <> '{}'::jsonb
     OR jsonb_typeof(w->'daysAhead') IS DISTINCT FROM 'number' OR coalesce(w->>'daysAhead','') !~ '^[0-9]{1,3}$'
     THEN RAISE EXCEPTION 'invalid_booking_window' USING ERRCODE='22023'; END IF;
   IF (w->>'daysAhead')::int NOT BETWEEN 0 AND 365 THEN RAISE EXCEPTION 'invalid_booking_window' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'invalid_booking_window' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.validate_booking_window(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_booking_window(p_org uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT setting_value FROM public.settings WHERE organization_id=p_org AND setting_key='booking_window'),'{"mode":"monthly","openingDay":25}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.read_booking_window(uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.booking_window_end(w jsonb,p_now timestamptz) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE
 today date := (p_now AT TIME ZONE 'Asia/Seoul')::date;
 month_start date := date_trunc('month',today)::date;
 opening_day integer;
BEGIN
 PERFORM public.validate_booking_window(w);
 IF w->>'mode'='rolling' THEN RETURN today+(w->>'daysAhead')::integer+1; END IF;
 opening_day := least((w->>'openingDay')::integer,extract(day FROM month_start+interval '1 month'-interval '1 day')::integer);
 RETURN (month_start+CASE WHEN extract(day FROM today)>=opening_day THEN interval '2 months' ELSE interval '1 month' END)::date;
END $$;
REVOKE ALL ON FUNCTION public.booking_window_end(jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_booking_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END; x jsonb;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.setting_key) IS DISTINCT FROM (OLD.organization_id,OLD.setting_key) THEN RAISE EXCEPTION 'setting_identity_not_allowed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:'||org::text,0));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.setting_key='booking_policy' THEN PERFORM public.validate_booking_policy(NEW.setting_value);
 ELSIF NEW.setting_key='booking_window' THEN PERFORM public.validate_booking_window(NEW.setting_value);
 ELSIF NEW.setting_key='max_concurrent_students' THEN
   IF jsonb_typeof(NEW.setting_value->'value') IS DISTINCT FROM 'number' OR coalesce(NEW.setting_value->>'value','') !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'invalid_booking_capacity'; END IF;
   IF (NEW.setting_value->>'value')::int NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid_booking_capacity'; END IF;
 ELSIF NEW.setting_key IN ('disabled_booking_start_times','disabled_booking_weekdays') THEN
   IF jsonb_typeof(NEW.setting_value->'value') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.setting_value->'value')>1440 THEN RAISE EXCEPTION 'invalid_booking_restrictions'; END IF;
   FOR x IN SELECT value FROM jsonb_array_elements(NEW.setting_value->'value') LOOP
     IF NEW.setting_key='disabled_booking_start_times' THEN
       IF jsonb_typeof(x)<>'string' OR (x#>>'{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'invalid_booking_restrictions'; END IF;
     ELSIF x::text !~ '^[0-6]$' THEN RAISE EXCEPTION 'invalid_booking_restrictions'; END IF;
   END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_booking_settings() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_schedule_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_max integer := 5;
  v_policy jsonb;
  v_minute integer;
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_start timestamp := NEW.start_time AT TIME ZONE 'Asia/Seoul';
  v_profile public.profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || NEW.organization_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || NEW.student_id::text, 0));
  v_policy := public.read_booking_policy(NEW.organization_id);
  IF NEW.end_time <= NEW.start_time OR NOT isfinite(NEW.start_time) OR NOT isfinite(NEW.end_time) THEN
    RAISE EXCEPTION 'schedule_invalid_interval';
  END IF;
  v_minute := extract(hour FROM v_start)::int*60+extract(minute FROM v_start)::int;
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
  SELECT * INTO v_profile FROM public.profiles WHERE profile_id = NEW.student_id;
  IF (v_profile.class_start_date IS NOT NULL AND v_start::date < v_profile.class_start_date)
    OR (v_profile.class_end_date IS NOT NULL AND v_start::date > v_profile.class_end_date) THEN
    RAISE EXCEPTION 'schedule_outside_course';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_admin(NEW.organization_id) AND NOT public.is_super_admin() THEN
    IF NEW.student_id <> public.get_current_profile_id() OR TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE = '42501';
    END IF;
    IF NEW.start_time < now() OR v_start::date < v_today
      OR v_start::date >= public.booking_window_end(public.read_booking_window(NEW.organization_id),now()) THEN
      RAISE EXCEPTION 'schedule_date_not_allowed';
    END IF;
    IF v_start::time < (v_policy->>'firstStart')::time OR v_start::time > (v_policy->>'lastStart')::time
      OR mod(v_minute-(extract(epoch FROM (v_policy->>'firstStart')::time)/60)::int,(v_policy->>'startIntervalMinutes')::int)<>0
      OR extract(second FROM v_start)<>0
      OR NOT (v_policy->'durationMinutes') @> jsonb_build_array(extract(epoch FROM (NEW.end_time-NEW.start_time))/60) THEN
      RAISE EXCEPTION 'schedule_time_not_allowed';
    END IF;
    IF NEW.start_time <= now() OR NEW.start_time < now()+make_interval(mins=>(v_policy->>'leadMinutes')::int) THEN
      RAISE EXCEPTION 'schedule_booking_closed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.settings WHERE organization_id = NEW.organization_id
      AND setting_key = 'disabled_booking_weekdays'
      AND (setting_value->'value') @> jsonb_build_array(extract(dow FROM v_start)::integer)) THEN
      RAISE EXCEPTION 'schedule_day_disabled';
    END IF;
    IF EXISTS (SELECT 1 FROM public.settings WHERE organization_id = NEW.organization_id
      AND setting_key = 'disabled_booking_start_times'
      AND (setting_value->'value') ? to_char(v_start, 'HH24:MI')) THEN
      RAISE EXCEPTION 'schedule_time_disabled';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_student_booking_availability_minutes(
  p_organization_id uuid, p_date date, p_minutes integer
) RETURNS TABLE (start_time timestamptz, available boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid := public.get_current_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_max integer := 5;
  v_policy jsonb := public.read_booking_policy(p_organization_id);
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_student IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members WHERE organization_id = p_organization_id
      AND profile_id = v_student AND role = 'STUDENT' AND state = 'NORMAL'
  ) THEN RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE = '42501'; END IF;
  IF p_date IS NULL OR p_minutes IS NULL OR NOT (v_policy->'durationMinutes') @> jsonb_build_array(p_minutes)
    OR p_date < v_today
    OR p_date >= public.booking_window_end(public.read_booking_window(p_organization_id),now())
  THEN RAISE EXCEPTION 'schedule_date_not_allowed'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE profile_id = v_student;
  SELECT coalesce((setting_value->>'value')::integer,5) INTO v_max FROM public.settings
    WHERE organization_id = p_organization_id AND setting_key = 'max_concurrent_students';
  v_max := coalesce(v_max,5);
  RETURN QUERY
  WITH slots AS (
    SELECT t AT TIME ZONE 'Asia/Seoul' AS slot FROM generate_series(
      p_date+(v_policy->>'firstStart')::time,p_date+(v_policy->>'lastStart')::time,
      make_interval(mins=>(v_policy->>'startIntervalMinutes')::int)) AS t
  ), checks AS (
    SELECT slot, CASE
      WHEN EXISTS (SELECT 1 FROM public.settings WHERE organization_id = p_organization_id
        AND setting_key = 'disabled_booking_weekdays'
        AND (setting_value->'value') @> jsonb_build_array(extract(dow FROM p_date)::integer)) THEN 'day_disabled'
      WHEN EXISTS (SELECT 1 FROM public.settings WHERE organization_id = p_organization_id
        AND setting_key = 'disabled_booking_start_times'
        AND (setting_value->'value') ? to_char(slot AT TIME ZONE 'Asia/Seoul', 'HH24:MI')) THEN 'disabled'
      WHEN slot <= now() THEN 'past'
      WHEN slot < now()+make_interval(mins=>(v_policy->>'leadMinutes')::int) THEN 'closed'
      WHEN (v_profile.class_start_date IS NOT NULL AND p_date < v_profile.class_start_date)
        OR (v_profile.class_end_date IS NOT NULL AND p_date > v_profile.class_end_date) THEN 'outside_course'
      WHEN EXISTS(SELECT 1 FROM public.schedules s WHERE s.cancelled_at IS NULL AND s.student_id = v_student
        AND s.start_time < slot + make_interval(mins => p_minutes) AND s.end_time > slot) THEN 'student_conflict'
      WHEN v_max < 1 OR public.schedule_peak_occupancy(p_organization_id,slot,slot+make_interval(mins=>p_minutes))>=v_max THEN 'capacity'
      ELSE NULL END AS unavailable_reason
    FROM slots
  ) SELECT slot, unavailable_reason IS NULL, unavailable_reason FROM checks ORDER BY slot;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_booking_availability_minutes(uuid,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_booking_availability_minutes(uuid,date,integer) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
