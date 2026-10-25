-- A reservation is retained after an attendance cancellation. Only confirmed
-- PRESENT lessons contribute to participation; old reservations stay PENDING.
ALTER TABLE public.schedules
  ADD COLUMN attendance_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN attendance_version integer NOT NULL DEFAULT 0,
  ADD COLUMN attendance_updated_at timestamptz,
  ADD COLUMN attendance_updated_by uuid,
  ADD COLUMN cancelled_at timestamptz,
  ADD CONSTRAINT schedules_attendance_status_check CHECK (attendance_status IN ('PENDING','PRESENT','ABSENT')),
  ADD CONSTRAINT schedules_attendance_cancellation_check CHECK ((attendance_status='ABSENT')=(cancelled_at IS NOT NULL)),
  ADD CONSTRAINT schedules_attendance_version_check CHECK (attendance_version>=0);
CREATE INDEX schedules_attendance_pending_idx ON public.schedules(organization_id,start_time,schedule_id) WHERE attendance_status='PENDING';
CREATE TABLE public.attendance_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(organization_id) ON DELETE CASCADE,
  schedule_id bigint NOT NULL,
  version integer NOT NULL,
  previous_status text NOT NULL,
  status text NOT NULL,
  actor_profile_id uuid NOT NULL,
  actor_name text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL,
  UNIQUE(schedule_id,version)
);
CREATE INDEX attendance_events_schedule_idx ON public.attendance_events(organization_id,schedule_id,version);
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.attendance_events TO authenticated;
GRANT ALL ON public.attendance_events TO service_role;
CREATE POLICY "attendance-events-admin-read" ON public.attendance_events FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));
CREATE POLICY account_access_guard ON public.attendance_events AS RESTRICTIVE FOR ALL TO authenticated
  USING((SELECT public.is_account_access_allowed())) WITH CHECK((SELECT public.is_account_access_allowed()));
--> statement-breakpoint
-- The write RPC is the only browser-accessible path to attendance fields.
CREATE FUNCTION public.protect_schedule_attendance() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_identity_changed boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.attendance_updated_at IS NOT NULL AND current_user='authenticated' THEN RAISE EXCEPTION 'attendance_record_locked'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.attendance_status<>'PENDING' OR NEW.attendance_version<>0 OR NEW.attendance_updated_at IS NOT NULL OR NEW.attendance_updated_by IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'attendance_rpc_required' USING ERRCODE='42501';
    END IF;
  ELSE
    v_identity_changed := (NEW.organization_id,NEW.student_id,NEW.program_id,NEW.start_time,NEW.end_time,NEW.parent_schedule_id,NEW.rrule)
      IS DISTINCT FROM (OLD.organization_id,OLD.student_id,OLD.program_id,OLD.start_time,OLD.end_time,OLD.parent_schedule_id,OLD.rrule);
    IF OLD.attendance_updated_at IS NOT NULL AND v_identity_changed THEN
      RAISE EXCEPTION 'attendance_record_locked';
    END IF;
    IF (NEW.attendance_status,NEW.attendance_version,NEW.attendance_updated_at,NEW.attendance_updated_by,NEW.cancelled_at)
      IS DISTINCT FROM (OLD.attendance_status,OLD.attendance_version,OLD.attendance_updated_at,OLD.attendance_updated_by,OLD.cancelled_at)
      AND (current_user='authenticated' OR coalesce(current_setting('lestly.attendance_write',true),'')<>'on') THEN
      RAISE EXCEPTION 'attendance_rpc_required' USING ERRCODE='42501';
    END IF;
    -- An ordinary reservation edit must also invalidate an already-open roster.
    -- This revision alone does not mark a lesson as attendance-checked.
    IF v_identity_changed THEN NEW.attendance_version := OLD.attendance_version+1; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_schedule_attendance BEFORE INSERT OR UPDATE OR DELETE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.protect_schedule_attendance();
REVOKE ALL ON FUNCTION public.protect_schedule_attendance() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.save_attendance(p_organization_id uuid,p_changes jsonb) RETURNS integer
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
      SELECT coalesce((setting_value->>'value')::integer,5) INTO v_max FROM public.settings
        WHERE organization_id=p_organization_id AND setting_key='max_concurrent_students';
      IF (SELECT count(*) FROM public.schedules other WHERE other.cancelled_at IS NULL AND other.organization_id=p_organization_id
        AND other.schedule_id<>s.schedule_id AND other.start_time<s.end_time AND other.end_time>s.start_time)>=coalesce(v_max,5) THEN RAISE EXCEPTION 'schedule_capacity_exceeded'; END IF;
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
--> statement-breakpoint
-- Keep the deployed production app's completed-reservation totals compatible
-- until its own attendance rollout. New clients use the explicit attended RPC.
CREATE OR REPLACE FUNCTION public.get_student_completed_hours(p_student_ids uuid[],p_organization_id uuid DEFAULT NULL)
RETURNS TABLE(student_id uuid,total_hours double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT s.student_id,SUM(EXTRACT(EPOCH FROM (s.end_time-s.start_time))/3600.0)::double precision FROM public.schedules s
    WHERE s.student_id=ANY(p_student_ids) AND (p_organization_id IS NULL OR s.organization_id=p_organization_id)
      AND s.end_time<=now() AND s.end_time>s.start_time AND s.cancelled_at IS NULL GROUP BY s.student_id;
$$;
CREATE FUNCTION public.get_student_attended_hours(p_student_ids uuid[],p_organization_id uuid DEFAULT NULL)
RETURNS TABLE(student_id uuid,total_hours double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT s.student_id,SUM(EXTRACT(EPOCH FROM (s.end_time-s.start_time))/3600.0)::double precision FROM public.schedules s
    WHERE s.student_id=ANY(p_student_ids) AND (p_organization_id IS NULL OR s.organization_id=p_organization_id)
      AND s.end_time<=now() AND s.attendance_status='PRESENT' AND s.cancelled_at IS NULL GROUP BY s.student_id;
$$;
REVOKE ALL ON FUNCTION public.get_student_attended_hours(uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_student_attended_hours(uuid[],uuid) TO authenticated,service_role;

--> statement-breakpoint
-- Cancelled attendance is excluded from booking conflicts and lifecycle checks.
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
  SELECT * INTO v_profile FROM public.profiles WHERE profile_id = NEW.student_id;
  IF (v_profile.class_start_date IS NOT NULL AND v_start::date < v_profile.class_start_date)
    OR (v_profile.class_end_date IS NOT NULL AND v_start::date > v_profile.class_end_date) THEN
    RAISE EXCEPTION 'schedule_outside_course';
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
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedules s WHERE s.cancelled_at IS NULL AND s.student_id = NEW.student_id
    AND s.schedule_id IS DISTINCT FROM NEW.schedule_id
    AND s.start_time < NEW.end_time AND s.end_time > NEW.start_time) THEN
    RAISE EXCEPTION 'schedule_student_conflict';
  END IF;
  SELECT coalesce((setting_value->>'value')::integer,5) INTO v_max FROM public.settings
    WHERE organization_id = NEW.organization_id AND setting_key = 'max_concurrent_students';
  v_max := coalesce(v_max,5);
  IF v_max < 1 OR (SELECT count(*) FROM public.schedules s
    WHERE s.cancelled_at IS NULL AND s.organization_id = NEW.organization_id AND s.schedule_id IS DISTINCT FROM NEW.schedule_id
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
      WHEN EXISTS(SELECT 1 FROM public.schedules s WHERE s.cancelled_at IS NULL AND s.student_id = v_student
        AND s.start_time < slot + make_interval(hours => p_hours) AND s.end_time > slot) THEN 'student_conflict'
      WHEN v_max < 1 OR (SELECT count(*) FROM public.schedules s WHERE s.cancelled_at IS NULL AND s.organization_id = p_organization_id
        AND s.start_time < slot + make_interval(hours => p_hours) AND s.end_time > slot) >= v_max THEN 'capacity'
      ELSE NULL END AS unavailable_reason
    FROM slots
  ) SELECT slot, unavailable_reason IS NULL, unavailable_reason FROM checks ORDER BY slot;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_student_change_impact(
  p_organization_id uuid, p_student_id uuid, p_state public.user_state, p_end date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.organization_members%ROWTYPE; old_end date; n bigint; fingerprint text; ongoing boolean; cutoff timestamptz;
BEGIN
  IF NOT public.is_org_admin(p_organization_id) THEN RAISE EXCEPTION 'student_not_authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.organization_members WHERE organization_id=p_organization_id AND profile_id=p_student_id AND role='STUDENT';
  IF NOT FOUND THEN RAISE EXCEPTION 'student_not_found' USING ERRCODE='P0002'; END IF;
  SELECT class_end_date INTO old_end FROM public.profiles WHERE profile_id=p_student_id;
  cutoff := CASE WHEN p_state IN ('GRADUATE','DELETED') AND m.state IS DISTINCT FROM p_state THEN now()
    WHEN p_end IS NOT NULL AND (old_end IS NULL OR p_end < old_end) THEN ((p_end+1)::timestamp AT TIME ZONE 'Asia/Seoul')
    ELSE 'infinity'::timestamptz END;
  SELECT count(*), md5(coalesce(string_agg(s.schedule_id::text || ':' || s.start_time::text, ',' ORDER BY s.schedule_id),'')) INTO n,fingerprint
    FROM public.schedules s WHERE s.cancelled_at IS NULL AND s.organization_id=p_organization_id AND s.student_id=p_student_id AND s.start_time>now() AND s.start_time>=cutoff;
  SELECT EXISTS(SELECT 1 FROM public.schedules s WHERE s.cancelled_at IS NULL AND s.organization_id=p_organization_id AND s.student_id=p_student_id
    AND s.start_time<=now() AND s.end_time>now()) INTO ongoing;
  RETURN jsonb_build_object('cancel_count',n,'in_progress',ongoing,
    'requires_confirmation', n>0 OR (p_state IS DISTINCT FROM m.state AND p_state IN ('GRADUATE','DELETED')),
    'token',md5(m.state::text || coalesce(old_end::text,'') || p_state::text || coalesce(p_end::text,'') || fingerprint));
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.apply_student_membership_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_auth uuid;
BEGIN
  IF TG_OP='INSERT' AND NEW.state<>'DELETED' THEN RETURN NEW; END IF;
  IF NEW.role<>'STUDENT' OR (TG_OP='UPDATE' AND NEW.state IS NOT DISTINCT FROM OLD.state) THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || NEW.organization_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || NEW.profile_id::text,0));
  IF NEW.state IN ('GRADUATE','DELETED') THEN
    IF EXISTS(SELECT 1 FROM public.schedules WHERE cancelled_at IS NULL AND organization_id=NEW.organization_id AND student_id=NEW.profile_id AND start_time<=now() AND end_time>now()) THEN
      RAISE EXCEPTION 'student_lesson_in_progress';
    END IF;
    PERFORM public.cancel_student_future_schedules(NEW.organization_id,NEW.profile_id,now());
    UPDATE public.student_invites SET revoked_at=now() WHERE organization_id=NEW.organization_id AND profile_id=NEW.profile_id AND revoked_at IS NULL AND used_at IS NULL;
    UPDATE public.notifications SET delivery_cancelled_at=now(),
      alimtalk_status=CASE WHEN alimtalk_status IN ('PENDING','SENDING','FAILED') THEN 'FAILED'::public.alimtalk_status ELSE alimtalk_status END,
      email_status=CASE WHEN email_status IN ('PENDING','FAILED') THEN 'SKIPPED'::public.email_status ELSE email_status END
      WHERE organization_id=NEW.organization_id AND recipient_profile_id=NEW.profile_id AND (alimtalk_status IN ('PENDING','SENDING','FAILED') OR email_status IN ('PENDING','FAILED'));
  END IF;
  IF NEW.state='DELETED' THEN
    INSERT INTO public.student_account_access(profile_id,blocked,valid_after)
      VALUES(NEW.profile_id,true,ceil(extract(epoch FROM clock_timestamp()))::bigint)
      ON CONFLICT(profile_id) DO UPDATE SET blocked=true,valid_after=excluded.valid_after;
    SELECT auth_user_id INTO target_auth FROM public.profiles WHERE profile_id=NEW.profile_id;
    -- Revoke refresh sessions as well as rejecting already-issued JWTs above.
    IF target_auth IS NOT NULL AND to_regclass('auth.sessions') IS NOT NULL THEN
      EXECUTE 'DELETE FROM auth.sessions WHERE user_id=$1' USING target_auth;
    END IF;
  ELSIF OLD.state='DELETED' THEN
    UPDATE public.student_account_access SET blocked=false,valid_after=ceil(extract(epoch FROM clock_timestamp()))::bigint WHERE profile_id=NEW.profile_id;
    SELECT auth_user_id INTO target_auth FROM public.profiles WHERE profile_id=NEW.profile_id;
    IF target_auth IS NOT NULL AND to_regclass('auth.sessions') IS NOT NULL THEN
      EXECUTE 'DELETE FROM auth.sessions WHERE user_id=$1' USING target_auth;
    END IF;
  END IF;
  RETURN NEW;
END $$;
