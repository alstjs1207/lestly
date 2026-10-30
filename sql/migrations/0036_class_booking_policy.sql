-- Organization lengths/capacity become class-creation defaults only.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.schedules WHERE program_id IS NULL) THEN
  RAISE EXCEPTION 'unlinked_schedules_require_explicit_repair';
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.programs ADD COLUMN booking_duration_minutes integer[];
-- One-time copy preserves multi-length operation and all existing reservations.
UPDATE public.programs p SET
 duration_minutes=coalesce(p.duration_minutes,(public.read_booking_policy(p.organization_id)->>'defaultDurationMinutes')::int),
 max_capacity=coalesce(p.max_capacity,(SELECT (setting_value->>'value')::int FROM public.settings WHERE organization_id=p.organization_id AND setting_key='max_concurrent_students'),5),
 booking_duration_minutes=ARRAY(SELECT DISTINCT n FROM (
   SELECT value::text::int n FROM jsonb_array_elements(public.read_booking_policy(p.organization_id)->'durationMinutes')
   UNION ALL SELECT coalesce(p.duration_minutes,(public.read_booking_policy(p.organization_id)->>'defaultDurationMinutes')::int)
 ) lengths ORDER BY n);
ALTER TABLE public.programs ALTER COLUMN duration_minutes DROP DEFAULT;
ALTER TABLE public.programs ALTER COLUMN duration_minutes SET NOT NULL;
ALTER TABLE public.programs ALTER COLUMN max_capacity SET NOT NULL;
ALTER TABLE public.programs ALTER COLUMN booking_duration_minutes SET NOT NULL;
ALTER TABLE public.programs ADD CONSTRAINT programs_booking_fields_check CHECK (
 duration_minutes BETWEEN 1 AND 1440 AND max_capacity BETWEEN 1 AND 100
 AND array_ndims(booking_duration_minutes)=1 AND cardinality(booking_duration_minutes) BETWEEN 1 AND 48
 AND 0<ALL(booking_duration_minutes) AND 1440>=ALL(booking_duration_minutes)
 AND duration_minutes=ANY(booking_duration_minutes) AND array_position(booking_duration_minutes,NULL) IS NULL
);
--> statement-breakpoint
CREATE FUNCTION public.guard_program_booking_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE defaults jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'program_identity_update_not_allowed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:'||NEW.organization_id::text,0));
 IF TG_OP='INSERT' THEN
  defaults:=public.read_booking_policy(NEW.organization_id);
  NEW.duration_minutes:=coalesce(NEW.duration_minutes,(defaults->>'defaultDurationMinutes')::int);
  NEW.max_capacity:=coalesce(NEW.max_capacity,(SELECT (setting_value->>'value')::int FROM public.settings WHERE organization_id=NEW.organization_id AND setting_key='max_concurrent_students'),5);
  IF NEW.booking_duration_minutes IS NULL THEN
   NEW.booking_duration_minutes:=ARRAY(SELECT DISTINCT n FROM (
    SELECT value::text::int n FROM jsonb_array_elements(defaults->'durationMinutes')
    UNION ALL SELECT NEW.duration_minutes
   ) lengths ORDER BY n);
  END IF;
 END IF;
 IF NEW.booking_duration_minutes IS NULL OR cardinality(NEW.booking_duration_minutes)<>(SELECT count(DISTINCT n) FROM unnest(NEW.booking_duration_minutes) n) THEN
  RAISE EXCEPTION 'invalid_program_booking_policy' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_program_booking_policy() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_program_booking_policy BEFORE INSERT OR UPDATE OF organization_id,duration_minutes,booking_duration_minutes,max_capacity ON public.programs FOR EACH ROW EXECUTE FUNCTION public.guard_program_booking_policy();
--> statement-breakpoint
ALTER TABLE public.schedules ALTER COLUMN program_id SET NOT NULL;
ALTER TABLE public.schedules DROP CONSTRAINT schedules_program_id_programs_program_id_fk;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_program_id_programs_program_id_fk FOREIGN KEY(program_id) REFERENCES public.programs(program_id) ON DELETE RESTRICT;
CREATE INDEX schedules_program_start_active_idx ON public.schedules(organization_id,program_id,start_time) WHERE cancelled_at IS NULL;
--> statement-breakpoint
CREATE FUNCTION public.read_program_booking_policy(p_org uuid,p_program bigint) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.programs%ROWTYPE;
BEGIN
 IF p_program IS NULL THEN RAISE EXCEPTION 'schedule_program_required'; END IF;
 SELECT * INTO p FROM public.programs WHERE program_id=p_program AND organization_id=p_org AND status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'schedule_program_not_eligible'; END IF;
 RETURN public.read_booking_policy(p_org)||jsonb_build_object('durationMinutes',to_jsonb(p.booking_duration_minutes),'defaultDurationMinutes',p.duration_minutes,'maxCapacity',p.max_capacity);
END $$;
REVOKE ALL ON FUNCTION public.read_program_booking_policy(uuid,bigint) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.program_peak_occupancy(p_org uuid,p_program bigint,p_start timestamptz,p_end timestamptz,p_exclude bigint[] DEFAULT '{}') RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 WITH intervals AS (
  SELECT greatest(start_time,p_start) a,least(end_time,p_end) b FROM public.schedules
  WHERE organization_id=p_org AND program_id=p_program AND cancelled_at IS NULL AND NOT schedule_id=ANY(p_exclude)
  AND start_time<p_end AND end_time>p_start
 ),events AS (SELECT a t,1 delta FROM intervals UNION ALL SELECT b,-1 FROM intervals),
 grouped AS (SELECT t,sum(delta) delta FROM events GROUP BY t),occupancy AS (SELECT sum(delta) OVER(ORDER BY t) n FROM grouped)
 SELECT coalesce(max(n),0)::integer FROM occupancy;
$$;
REVOKE ALL ON FUNCTION public.program_peak_occupancy(uuid,bigint,timestamptz,timestamptz,bigint[]) FROM PUBLIC,anon,authenticated;
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
  IF NEW.parent_schedule_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.schedules s
    WHERE s.schedule_id = NEW.parent_schedule_id AND s.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'schedule_parent_not_eligible';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE profile_id = NEW.student_id;
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
CREATE OR REPLACE FUNCTION public.enforce_schedule_occupancy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_max integer := 5;
BEGIN
  IF NEW.cancelled_at IS NOT NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules s WHERE s.cancelled_at IS NULL AND s.student_id = NEW.student_id
    AND s.schedule_id IS DISTINCT FROM NEW.schedule_id
    AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time) THEN
    RAISE EXCEPTION 'schedule_student_conflict';
  END IF;
  SELECT max_capacity INTO v_max FROM public.programs WHERE organization_id=NEW.organization_id AND program_id=NEW.program_id;
  IF v_max < 1 OR public.program_peak_occupancy(NEW.organization_id,NEW.program_id,NEW.start_time,NEW.end_time,ARRAY[NEW.schedule_id]) >= v_max THEN
    RAISE EXCEPTION 'schedule_capacity_exceeded';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.enforce_schedule_occupancy() FROM PUBLIC,anon,authenticated;
DROP TRIGGER enforce_schedule_occupancy ON public.schedules;
CREATE TRIGGER enforce_schedule_occupancy AFTER INSERT OR UPDATE OF organization_id,program_id,student_id,start_time,end_time,cancelled_at ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_occupancy();

--> statement-breakpoint
CREATE FUNCTION public.get_student_program_booking_availability(
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

REVOKE ALL ON FUNCTION public.get_student_program_booking_availability(uuid,bigint,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_program_booking_availability(uuid,bigint,date,integer) TO authenticated;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.save_attendance(p_organization_id uuid,p_changes jsonb) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s public.schedules%ROWTYPE;
  x record;
  v_actor uuid := public.get_current_profile_id();
  v_actor_name text;
  v_changed integer := 0;
  v_count integer;
  v_max integer;
  v_flag text := current_setting('lestly.attendance_write',true);
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_actor IS NULL OR NOT public.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'attendance_not_authorized' USING ERRCODE='42501'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'array' THEN RAISE EXCEPTION 'attendance_invalid_changes'; END IF;
  v_count := jsonb_array_length(p_changes);
  IF v_count<1 OR v_count>200 THEN RAISE EXCEPTION 'attendance_invalid_changes'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_changes) v WHERE jsonb_typeof(v)<>'object'
    OR coalesce(v->>'schedule_id','') !~ '^[1-9][0-9]*$'
    OR coalesce(v->>'version','') !~ '^(0|[1-9][0-9]*)$'
    OR coalesce(v->>'status','') NOT IN ('PENDING','PRESENT','ABSENT')) THEN RAISE EXCEPTION 'attendance_invalid_changes'; END IF;
  IF (SELECT count(DISTINCT (v->>'schedule_id')::bigint) FROM jsonb_array_elements(p_changes) v)<>v_count THEN RAISE EXCEPTION 'attendance_invalid_changes'; END IF;
  -- Share the booking/lifecycle lock order. This also serializes whole batches.
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:'||p_organization_id::text,0));
  FOR x IN SELECT DISTINCT student_id FROM public.schedules WHERE organization_id=p_organization_id
    AND schedule_id IN (SELECT (v->>'schedule_id')::bigint FROM jsonb_array_elements(p_changes) v) ORDER BY student_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:'||x.student_id::text,0));
  END LOOP;
  PERFORM 1 FROM public.schedules WHERE organization_id=p_organization_id
    AND schedule_id IN (SELECT (v->>'schedule_id')::bigint FROM jsonb_array_elements(p_changes) v) ORDER BY schedule_id FOR UPDATE;
  IF (SELECT count(*) FROM public.schedules WHERE organization_id=p_organization_id
    AND schedule_id IN (SELECT (v->>'schedule_id')::bigint FROM jsonb_array_elements(p_changes) v))<>v_count THEN
    RAISE EXCEPTION 'attendance_schedule_changed' USING ERRCODE='P0002';
  END IF;
  -- Validate every row before writing any row. Stale retry of the same result
  -- is a no-op; a stale request with a different result rejects the whole batch.
  FOR x IN SELECT * FROM jsonb_to_recordset(p_changes) AS c(schedule_id bigint,version integer,status text) LOOP
    SELECT * INTO STRICT s FROM public.schedules WHERE schedule_id=x.schedule_id AND organization_id=p_organization_id;
    IF s.attendance_version<>x.version AND s.attendance_status<>x.status THEN RAISE EXCEPTION 'attendance_conflict'; END IF;
    IF s.start_time>now() THEN RAISE EXCEPTION 'attendance_not_started'; END IF;
  END LOOP;
  SELECT name INTO v_actor_name FROM public.profiles WHERE profile_id=v_actor;
  PERFORM set_config('lestly.attendance_write','on',true);
  -- Cancel absences first, so a batch can release a place before correcting
  -- another absence back to PRESENT/PENDING.
  FOR x IN SELECT * FROM jsonb_to_recordset(p_changes) AS c(schedule_id bigint,version integer,status text)
    ORDER BY (status='ABSENT') DESC,schedule_id LOOP
    SELECT * INTO STRICT s FROM public.schedules WHERE schedule_id=x.schedule_id AND organization_id=p_organization_id;
    IF s.attendance_status=x.status THEN CONTINUE; END IF;
    IF s.cancelled_at IS NOT NULL AND x.status<>'ABSENT' THEN
      IF EXISTS(SELECT 1 FROM public.schedules other WHERE other.cancelled_at IS NULL AND other.student_id=s.student_id
        AND other.schedule_id<>s.schedule_id AND other.start_time<s.end_time AND other.end_time>s.start_time) THEN RAISE EXCEPTION 'schedule_student_conflict'; END IF;
      SELECT max_capacity INTO v_max FROM public.programs WHERE organization_id=p_organization_id AND program_id=s.program_id;
      IF public.program_peak_occupancy(p_organization_id,s.program_id,s.start_time,s.end_time,ARRAY[s.schedule_id])>=v_max THEN RAISE EXCEPTION 'schedule_capacity_exceeded'; END IF;
    END IF;
    INSERT INTO public.attendance_events(organization_id,schedule_id,version,previous_status,status,actor_profile_id,actor_name,recorded_at,snapshot)
    SELECT p_organization_id,s.schedule_id,s.attendance_version+1,s.attendance_status,x.status,v_actor,coalesce(v_actor_name,''),v_now,
      coalesce((SELECT e.snapshot FROM public.attendance_events e WHERE e.schedule_id=s.schedule_id ORDER BY e.version LIMIT 1),
      jsonb_build_object('student_id',s.student_id,'student_name',p.name,'program_id',s.program_id,'program_title',pr.title,
        'instructor_id',pr.instructor_id,'instructor_name',i.name,'start_time',s.start_time,'end_time',s.end_time,
        'parent_schedule_id',s.parent_schedule_id,'rrule',s.rrule))
      FROM public.profiles p LEFT JOIN public.programs pr ON pr.program_id=s.program_id AND pr.organization_id=p_organization_id
      LEFT JOIN public.instructors i ON i.instructor_id=pr.instructor_id AND i.organization_id=p_organization_id WHERE p.profile_id=s.student_id;
    UPDATE public.schedules SET attendance_status=x.status,attendance_version=attendance_version+1,
      attendance_updated_at=v_now,attendance_updated_by=v_actor,
      cancelled_at=CASE WHEN x.status='ABSENT' THEN v_now ELSE NULL END WHERE schedule_id=s.schedule_id;
    IF x.status='ABSENT' THEN
      UPDATE public.notifications SET delivery_cancelled_at=v_now,
        alimtalk_status=CASE WHEN alimtalk_status IN ('PENDING','SENDING','FAILED') THEN 'FAILED'::public.alimtalk_status ELSE alimtalk_status END,
        alimtalk_error_message=CASE WHEN alimtalk_status IN ('PENDING','SENDING','FAILED') THEN 'Attendance cancellation' ELSE alimtalk_error_message END,
        email_status=CASE WHEN email_status IN ('PENDING','FAILED') THEN 'SKIPPED'::public.email_status ELSE email_status END WHERE schedule_id=s.schedule_id;
    END IF;
    v_changed:=v_changed+1;
  END LOOP;
  PERFORM set_config('lestly.attendance_write',coalesce(v_flag,''),true);
  RETURN v_changed;
END $$;
REVOKE ALL ON FUNCTION public.save_attendance(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_attendance(uuid,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
