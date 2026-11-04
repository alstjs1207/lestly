-- Require explicit course ends and complete dates for new bookings.
-- No customer profiles, schedules, attendance or account access rows are changed.
CREATE OR REPLACE FUNCTION public.save_managed_student(p_organization_id uuid, p_values jsonb, p_student_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_current record;
  v_phone text := nullif(regexp_replace(coalesce(p_values->>'phone', ''), '[^0-9]', '', 'g'), '');
  v_type text := CASE p_values->>'type' WHEN 'EXAMINEE' THEN 'STUDENT' WHEN 'DROPPER' THEN 'STUDENT' ELSE nullif(btrim(p_values->>'type'), '') END;
  v_description text := nullif(btrim(p_values->>'description'), '');
  v_state public.user_state := (p_values->>'state')::public.user_state;
  v_start date := nullif(p_values->>'class_start_date', '')::date;
  v_end date := nullif(p_values->>'class_end_date', '')::date;
BEGIN
  IF NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'student_access_denied' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_values->>'name'), '') IS NULL
    OR v_phone IS NULL OR v_phone !~ '^[0-9]{9,11}$' OR v_type IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.organization_student_types t WHERE t.organization_id=p_organization_id AND t.code=v_type
      AND (t.is_active OR EXISTS (SELECT 1 FROM public.organization_members m
        WHERE m.organization_id=p_organization_id AND m.profile_id=p_student_id AND m.role='STUDENT' AND m.type=v_type)))
    OR (v_start IS NOT NULL AND v_end IS NOT NULL AND v_end < v_start) THEN
    RAISE EXCEPTION 'invalid_student_values' USING ERRCODE = '22023';
  END IF;

  -- Legacy callers can still submit DROPPER without discarding that information.
  IF p_values->>'type' = 'DROPPER' AND strpos(coalesce(v_description,''), '[이전 유형: 재수생]') = 0 THEN
    v_description := concat_ws(E'\n', v_description, '[이전 유형: 재수생]');
  END IF;

  IF p_student_id IS NOT NULL THEN
    SELECT m.state, m.type, p.class_start_date, p.class_end_date INTO v_current
    FROM public.organization_members m JOIN public.profiles p USING (profile_id)
    WHERE m.organization_id=p_organization_id AND m.profile_id=p_student_id AND m.role='STUDENT';
    IF NOT FOUND THEN RAISE EXCEPTION 'student_not_found' USING ERRCODE = 'P0002'; END IF;

    -- Basic edits do not participate in booking serialization. Do not write lifecycle
    -- fields here: a concurrent graduation or course change must remain intact.
    IF (v_state IS NULL OR v_current.state IS NOT DISTINCT FROM v_state) AND v_current.type IS NOT DISTINCT FROM v_type
      AND v_current.class_start_date IS NOT DISTINCT FROM v_start
      AND v_current.class_end_date IS NOT DISTINCT FROM v_end THEN
      UPDATE public.profiles SET
        name = btrim(p_values->>'name'), phone = v_phone, region = nullif(btrim(p_values->>'region'), ''),
        contact_email = nullif(btrim(p_values->>'email'), ''),
        birth_date = nullif(p_values->>'birth_date', '')::date,
        parent_name = nullif(btrim(p_values->>'parent_name'), ''),
        parent_phone = nullif(btrim(p_values->>'parent_phone'), ''),
        description = v_description,
        color = coalesce(p_values->>'color', '#3B82F6')
      WHERE profile_id = p_student_id;
      RETURN p_student_id;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || p_organization_id::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || p_student_id::text, 0));
    SELECT p.class_start_date, p.class_end_date INTO v_current
      FROM public.profiles p WHERE p.profile_id=p_student_id FOR UPDATE;
    SELECT m.state, m.type, v_current.class_start_date, v_current.class_end_date INTO v_current
      FROM public.organization_members m WHERE m.organization_id=p_organization_id
      AND m.profile_id=p_student_id AND m.role='STUDENT' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'student_not_found' USING ERRCODE = 'P0002'; END IF;
    v_state := coalesce(v_state, v_current.state);
    IF (v_current.class_start_date IS DISTINCT FROM v_start OR v_current.class_end_date IS DISTINCT FROM v_end)
      AND EXISTS(SELECT 1 FROM public.organization_members m WHERE m.profile_id=p_student_id
        AND m.role='STUDENT' AND m.organization_id<>p_organization_id AND NOT public.is_org_admin(m.organization_id)) THEN
      RAISE EXCEPTION 'course_period_shared_profile';
    END IF;
    IF (v_state IN ('GRADUATE','DELETED') AND v_current.state IS DISTINCT FROM v_state)
      OR (v_end IS NOT NULL AND (v_current.class_end_date IS NULL OR v_end<v_current.class_end_date)) THEN
      PERFORM public.confirm_student_change(p_organization_id, p_student_id, v_state, v_end, p_values->>'lifecycle_confirmation');
    END IF;
    v_id := p_student_id;
    UPDATE public.profiles SET
      name = btrim(p_values->>'name'), phone = v_phone, region = nullif(btrim(p_values->>'region'), ''),
      contact_email = nullif(btrim(p_values->>'email'), ''),
      birth_date = nullif(p_values->>'birth_date', '')::date,
      class_start_date = v_start, class_end_date = v_end,
      parent_name = nullif(btrim(p_values->>'parent_name'), ''),
      parent_phone = nullif(btrim(p_values->>'parent_phone'), ''),
      description = v_description,
      color = coalesce(p_values->>'color', '#3B82F6')
    WHERE profile_id = v_id;
    UPDATE public.organization_members SET state = v_state, type = v_type
    WHERE organization_id = p_organization_id AND profile_id = v_id AND role = 'STUDENT';
  ELSE
    v_id := gen_random_uuid();
    v_start := coalesce(v_start, (now() AT TIME ZONE 'Asia/Seoul')::date);
    IF v_end IS NULL THEN RAISE EXCEPTION 'student_course_end_required' USING ERRCODE = '22023'; END IF;
    IF v_end < v_start THEN RAISE EXCEPTION 'invalid_student_values' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.profiles (profile_id, auth_user_id, name, phone, region, contact_email,
      birth_date, class_start_date, class_end_date, parent_name, parent_phone, description, color, marketing_consent)
    VALUES (v_id, NULL, btrim(p_values->>'name'), v_phone, nullif(btrim(p_values->>'region'), ''),
      nullif(btrim(p_values->>'email'), ''), nullif(p_values->>'birth_date', '')::date,
      v_start, v_end, nullif(btrim(p_values->>'parent_name'), ''), nullif(btrim(p_values->>'parent_phone'), ''),
      v_description, coalesce(p_values->>'color', '#3B82F6'), false);
    INSERT INTO public.organization_members (organization_id, profile_id, role, state, type)
    VALUES (p_organization_id, v_id, 'STUDENT', 'NORMAL', v_type);
  END IF;
  RETURN v_id;
END $$;
--> statement-breakpoint
-- Validate changed dates without rejecting untouched legacy profiles.
CREATE FUNCTION public.validate_student_course_dates() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.class_start_date,NEW.class_end_date)
    IS NOT DISTINCT FROM (OLD.class_start_date,OLD.class_end_date) THEN RETURN NEW; END IF;
  IF NEW.class_start_date IS NOT NULL AND NEW.class_end_date IS NULL THEN
    RAISE EXCEPTION 'student_course_end_required' USING ERRCODE = '22023';
  END IF;
  IF NEW.class_start_date IS NOT NULL AND NEW.class_end_date < NEW.class_start_date THEN
    RAISE EXCEPTION 'invalid_student_values' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_student_course_dates() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_student_course_dates BEFORE INSERT OR UPDATE OF class_start_date,class_end_date
ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_student_course_dates();

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
  v_policy := public.read_program_booking_policy(NEW.organization_id,NEW.program_id);
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
  IF TG_OP='UPDATE' AND NEW.start_time IS DISTINCT FROM OLD.start_time AND v_start::date<v_today THEN
    RAISE EXCEPTION 'schedule_date_not_allowed';
  END IF;
  IF NEW.parent_schedule_id IS NOT NULL
    AND NOT (TG_OP='UPDATE' AND NEW.parent_schedule_id IS NOT DISTINCT FROM OLD.parent_schedule_id
      AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id)
    AND NOT EXISTS (SELECT 1 FROM public.schedules s
      WHERE s.schedule_id=NEW.parent_schedule_id AND s.organization_id=NEW.organization_id AND s.student_id=NEW.student_id) THEN
    RAISE EXCEPTION 'schedule_parent_not_eligible';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE profile_id = NEW.student_id;
  IF v_profile.class_start_date IS NULL OR v_profile.class_end_date IS NULL THEN
    RAISE EXCEPTION 'schedule_course_dates_required';
  END IF;
  IF (v_profile.class_start_date IS NOT NULL AND v_start::date < v_profile.class_start_date)
    OR (v_profile.class_end_date IS NOT NULL AND v_start::date > v_profile.class_end_date) THEN
    RAISE EXCEPTION 'schedule_outside_course';
  END IF;
  IF (TG_OP='INSERT' OR NEW.program_id IS DISTINCT FROM OLD.program_id OR NEW.end_time-NEW.start_time IS DISTINCT FROM OLD.end_time-OLD.start_time)
    AND NOT (v_policy->'durationMinutes') @> jsonb_build_array(extract(epoch FROM (NEW.end_time-NEW.start_time))/60) THEN
    RAISE EXCEPTION 'schedule_time_not_allowed';
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
CREATE OR REPLACE FUNCTION public.get_student_program_booking_availability(
  p_organization_id uuid, p_program_id bigint, p_date date, p_minutes integer
) RETURNS TABLE (start_time timestamptz, available boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_student uuid := public.get_current_profile_id();
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_max integer := 5;
  v_policy jsonb;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_student IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members WHERE organization_id = p_organization_id
      AND profile_id = v_student AND role = 'STUDENT' AND state = 'NORMAL'
  ) THEN RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE = '42501'; END IF;
  v_policy := public.read_program_booking_policy(p_organization_id,p_program_id);
  IF p_date IS NULL OR p_minutes IS NULL OR NOT (v_policy->'durationMinutes') @> jsonb_build_array(p_minutes)
    OR p_date < v_today
    OR p_date >= public.booking_window_end(public.read_booking_window(p_organization_id),now())
  THEN RAISE EXCEPTION 'schedule_date_not_allowed'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE profile_id = v_student;
  v_max := (v_policy->>'maxCapacity')::int;
  RETURN QUERY
  WITH slots AS (
    SELECT t AT TIME ZONE 'Asia/Seoul' AS slot FROM generate_series(
      p_date+(v_policy->>'firstStart')::time,p_date+(v_policy->>'lastStart')::time,
      make_interval(mins=>(v_policy->>'startIntervalMinutes')::int)) AS t
  ), checks AS (
    SELECT slot, CASE
      WHEN v_profile.class_start_date IS NULL OR v_profile.class_end_date IS NULL THEN 'course_dates_required'
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
      WHEN v_max < 1 OR public.program_peak_occupancy(p_organization_id,p_program_id,slot,slot+make_interval(mins=>p_minutes))>=v_max THEN 'capacity'
      ELSE NULL END AS unavailable_reason
    FROM slots
  ) SELECT slot, unavailable_reason IS NULL, unavailable_reason FROM checks ORDER BY slot;
END;
$$;
NOTIFY pgrst, 'reload schema';
