-- Student lifecycle: cancellation uses the existing DELETE semantics. Completed
-- schedules are retained; no per-row history/episode feature is introduced.
CREATE TABLE public.student_account_access (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  blocked boolean NOT NULL DEFAULT false,
  valid_after bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.student_account_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_account_access FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_account_access TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.is_account_access_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.student_account_access a JOIN public.profiles p USING(profile_id)
    WHERE p.auth_user_id = auth.uid() AND
      (a.blocked OR coalesce((auth.jwt()->>'iat')::bigint, 0) < a.valid_after)
  );
$$;
REVOKE ALL ON FUNCTION public.is_account_access_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_account_access_allowed() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.get_current_profile_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.profile_id FROM public.profiles p
  WHERE p.auth_user_id = auth.uid() AND public.is_account_access_allowed() LIMIT 1;
$$;
--> statement-breakpoint
-- Security-definer RPCs also consult these helpers, so stale JWTs cannot
-- bypass the table-level revocation guard through a write RPC.
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_account_access_allowed() AND EXISTS(SELECT 1 FROM public.organization_members m
    JOIN public.profiles p USING(profile_id) WHERE p.auth_user_id=auth.uid()
    AND m.organization_id=org_id AND m.role='ADMIN' AND m.state='NORMAL');
$$;
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.is_account_access_allowed() AND coalesce(auth.jwt()->'app_metadata'->>'role'='super_admin',false);
$$;
--> statement-breakpoint
-- A statement-level InitPlan checks revocation once, not once per returned row.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename <> 'student_account_access' LOOP
    EXECUTE format('CREATE POLICY account_access_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_account_access_allowed())) WITH CHECK ((SELECT public.is_account_access_allowed()))', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedules_lifecycle_idx ON public.schedules(organization_id, student_id, start_time);
CREATE INDEX IF NOT EXISTS notifications_schedule_lifecycle_idx ON public.notifications(schedule_id) WHERE schedule_id IS NOT NULL;
ALTER TABLE public.notifications ADD COLUMN delivery_cancelled_at timestamptz;
--> statement-breakpoint
CREATE FUNCTION public.get_student_change_impact(
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
    FROM public.schedules s WHERE s.organization_id=p_organization_id AND s.student_id=p_student_id AND s.start_time>now() AND s.start_time>=cutoff;
  SELECT EXISTS(SELECT 1 FROM public.schedules s WHERE s.organization_id=p_organization_id AND s.student_id=p_student_id
    AND s.start_time<=now() AND s.end_time>now()) INTO ongoing;
  RETURN jsonb_build_object('cancel_count',n,'in_progress',ongoing,
    'requires_confirmation', n>0 OR (p_state IS DISTINCT FROM m.state AND p_state IN ('GRADUATE','DELETED')),
    'token',md5(m.state::text || coalesce(old_end::text,'') || p_state::text || coalesce(p_end::text,'') || fingerprint));
END $$;
REVOKE ALL ON FUNCTION public.get_student_change_impact(uuid,uuid,public.user_state,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_change_impact(uuid,uuid,public.user_state,date) TO authenticated;
CREATE FUNCTION public.confirm_student_change(p_org uuid,p_student uuid,p_state public.user_state,p_end date,p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE impact jsonb; old_state public.user_state;
BEGIN
  impact := public.get_student_change_impact(p_org,p_student,p_state,p_end);
  SELECT state INTO old_state FROM public.organization_members WHERE organization_id=p_org AND profile_id=p_student;
  IF p_state IN ('GRADUATE','DELETED') AND old_state IS DISTINCT FROM p_state AND (impact->>'in_progress')::boolean THEN
    RAISE EXCEPTION 'student_lesson_in_progress' USING ERRCODE='P0001';
  END IF;
  IF (impact->>'requires_confirmation')::boolean AND p_token IS DISTINCT FROM impact->>'token' THEN
    RAISE EXCEPTION 'student_change_confirmation_required' USING ERRCODE='P0001', DETAIL=impact::text;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.confirm_student_change(uuid,uuid,public.user_state,date,text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION public.cancel_student_future_schedules(p_org uuid,p_student uuid,p_cutoff timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE old_flag text := current_setting('lestly.lifecycle_cancel',true);
BEGIN
  PERFORM set_config('lestly.lifecycle_cancel','on',true);
  UPDATE public.notifications n SET delivery_cancelled_at=now(),
    alimtalk_status=CASE WHEN n.alimtalk_status IN ('PENDING','SENDING','FAILED') THEN 'FAILED'::public.alimtalk_status ELSE n.alimtalk_status END,
    alimtalk_error_message=CASE WHEN n.alimtalk_status IN ('PENDING','SENDING','FAILED') THEN 'Student reservation cancelled' ELSE n.alimtalk_error_message END,
    email_status=CASE WHEN n.email_status IN ('PENDING','FAILED') THEN 'SKIPPED'::public.email_status ELSE n.email_status END
  WHERE n.schedule_id IN (SELECT schedule_id FROM public.schedules WHERE organization_id=p_org AND student_id=p_student AND start_time>now() AND start_time>=p_cutoff);
  DELETE FROM public.schedules WHERE organization_id=p_org AND student_id=p_student AND start_time>now() AND start_time>=p_cutoff;
  PERFORM set_config('lestly.lifecycle_cancel',coalesce(old_flag,''),true);
END $$;
REVOKE ALL ON FUNCTION public.cancel_student_future_schedules(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.apply_student_membership_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_auth uuid;
BEGIN
  IF TG_OP='INSERT' AND NEW.state<>'DELETED' THEN RETURN NEW; END IF;
  IF NEW.role<>'STUDENT' OR (TG_OP='UPDATE' AND NEW.state IS NOT DISTINCT FROM OLD.state) THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || NEW.organization_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || NEW.profile_id::text,0));
  IF NEW.state IN ('GRADUATE','DELETED') THEN
    IF EXISTS(SELECT 1 FROM public.schedules WHERE organization_id=NEW.organization_id AND student_id=NEW.profile_id AND start_time<=now() AND end_time>now()) THEN
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
CREATE TRIGGER apply_student_membership_lifecycle BEFORE INSERT OR UPDATE OF state ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.apply_student_membership_lifecycle();
REVOKE ALL ON FUNCTION public.apply_student_membership_lifecycle() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.apply_student_course_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m record;
BEGIN
  IF NEW.class_end_date IS NULL OR (OLD.class_end_date IS NOT NULL AND NEW.class_end_date>=OLD.class_end_date) THEN RETURN NEW; END IF;
  FOR m IN SELECT organization_id FROM public.organization_members WHERE profile_id=NEW.profile_id AND role='STUDENT' ORDER BY organization_id LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || m.organization_id::text,0));
    PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || NEW.profile_id::text,0));
    PERFORM public.cancel_student_future_schedules(m.organization_id,NEW.profile_id,((NEW.class_end_date+1)::timestamp AT TIME ZONE 'Asia/Seoul'));
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER apply_student_course_lifecycle BEFORE UPDATE OF class_end_date ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.apply_student_course_lifecycle();
REVOKE ALL ON FUNCTION public.apply_student_course_lifecycle() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.set_student_state(p_organization_id uuid,p_student_id uuid,p_state public.user_state,p_confirmation text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE e date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || p_organization_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || p_student_id::text,0));
  SELECT class_end_date INTO e FROM public.profiles WHERE profile_id=p_student_id;
  PERFORM public.confirm_student_change(p_organization_id,p_student_id,p_state,e,p_confirmation);
  UPDATE public.organization_members SET state=p_state WHERE organization_id=p_organization_id AND profile_id=p_student_id AND role='STUDENT';
END $$;
REVOKE ALL ON FUNCTION public.set_student_state(uuid,uuid,public.user_state,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_student_state(uuid,uuid,public.user_state,text) TO authenticated;
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
CREATE OR REPLACE FUNCTION public.save_managed_student(p_organization_id uuid, p_values jsonb, p_student_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_phone text := nullif(regexp_replace(coalesce(p_values->>'phone', ''), '[^0-9]', '', 'g'), '');
  v_type public.user_type := (p_values->>'type')::public.user_type;
  v_state public.user_state := coalesce(p_values->>'state', 'NORMAL')::public.user_state;
  v_start date := nullif(p_values->>'class_start_date', '')::date;
  v_end date := nullif(p_values->>'class_end_date', '')::date;
BEGIN
  IF NOT public.is_org_admin(p_organization_id) THEN
    RAISE EXCEPTION 'student_access_denied' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(p_values->>'name'), '') IS NULL
    OR nullif(btrim(p_values->>'region'), '') IS NULL
    OR v_phone IS NULL OR v_phone !~ '^[0-9]{9,11}$' OR v_type IS NULL
    OR (v_start IS NOT NULL AND v_end IS NOT NULL AND v_end < v_start) THEN
    RAISE EXCEPTION 'invalid_student_values' USING ERRCODE = '22023';
  END IF;

  IF p_student_id IS NOT NULL THEN
    -- Check before acquiring profile locks; check again with a membership lock.
    PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || p_organization_id::text, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || p_student_id::text, 0));
    IF EXISTS(SELECT 1 FROM public.profiles p WHERE p.profile_id=p_student_id
      AND (p.class_start_date IS DISTINCT FROM v_start OR p.class_end_date IS DISTINCT FROM v_end))
      AND EXISTS(SELECT 1 FROM public.organization_members m WHERE m.profile_id=p_student_id
        AND m.role='STUDENT' AND m.organization_id<>p_organization_id AND NOT public.is_org_admin(m.organization_id)) THEN
      RAISE EXCEPTION 'course_period_shared_profile';
    END IF;
    PERFORM public.confirm_student_change(p_organization_id, p_student_id, v_state, v_end, p_values->>'lifecycle_confirmation');
    IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = p_organization_id
      AND profile_id = p_student_id AND role = 'STUDENT') THEN
      RAISE EXCEPTION 'student_not_found' USING ERRCODE = 'P0002';
    END IF;
    PERFORM 1 FROM public.profiles WHERE profile_id = p_student_id FOR UPDATE;
    PERFORM 1 FROM public.organization_members WHERE organization_id = p_organization_id
      AND profile_id = p_student_id AND role = 'STUDENT' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'student_not_found' USING ERRCODE = 'P0002'; END IF;
    v_id := p_student_id;
    UPDATE public.profiles SET
      name = btrim(p_values->>'name'), phone = v_phone, region = btrim(p_values->>'region'),
      contact_email = nullif(btrim(p_values->>'email'), ''),
      birth_date = nullif(p_values->>'birth_date', '')::date,
      class_start_date = v_start, class_end_date = v_end,
      parent_name = nullif(btrim(p_values->>'parent_name'), ''),
      parent_phone = nullif(btrim(p_values->>'parent_phone'), ''),
      description = nullif(btrim(p_values->>'description'), ''),
      color = coalesce(p_values->>'color', '#3B82F6')
    WHERE profile_id = v_id;
    UPDATE public.organization_members SET state = v_state, type = v_type
    WHERE organization_id = p_organization_id AND profile_id = v_id AND role = 'STUDENT';
  ELSE
    v_id := gen_random_uuid();
    v_start := coalesce(v_start, (now() AT TIME ZONE 'Asia/Seoul')::date);
    v_end := coalesce(v_end, (v_start + interval '1 year')::date);
    IF v_end < v_start THEN RAISE EXCEPTION 'invalid_student_values' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.profiles (profile_id, auth_user_id, name, phone, region, contact_email,
      birth_date, class_start_date, class_end_date, parent_name, parent_phone, description, color, marketing_consent)
    VALUES (v_id, NULL, btrim(p_values->>'name'), v_phone, btrim(p_values->>'region'),
      nullif(btrim(p_values->>'email'), ''), nullif(p_values->>'birth_date', '')::date,
      v_start, v_end, nullif(btrim(p_values->>'parent_name'), ''), nullif(btrim(p_values->>'parent_phone'), ''),
      nullif(btrim(p_values->>'description'), ''), coalesce(p_values->>'color', '#3B82F6'), false);
    INSERT INTO public.organization_members (organization_id, profile_id, role, state, type)
    VALUES (p_organization_id, v_id, 'STUDENT', 'NORMAL', v_type);
  END IF;
  RETURN v_id;
END $$;
--> statement-breakpoint
-- Add only the cancellation fast path to the latest deployed trigger body.
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('public.on_schedule_delete()'::regprocedure) INTO definition;
  definition := replace(definition, E'BEGIN\n', E'BEGIN\n  IF current_setting(''lestly.lifecycle_cancel'', true) = ''on'' THEN RETURN OLD; END IF;\n');
  EXECUTE definition;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.can_deliver_student_notification(p_notification_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.notifications n WHERE n.notification_id=p_notification_id
    AND n.delivery_cancelled_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.organization_members m WHERE m.organization_id=n.organization_id
        AND m.profile_id=n.recipient_profile_id AND m.role='STUDENT' AND m.state<>'NORMAL'));
$$;
REVOKE ALL ON FUNCTION public.can_deliver_student_notification(bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_deliver_student_notification(bigint) TO service_role;
CREATE FUNCTION public.guard_student_notification_delivery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.delivery_cancelled_at IS NOT NULL THEN
    NEW.delivery_cancelled_at := OLD.delivery_cancelled_at;
  END IF;
  IF NEW.delivery_cancelled_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.organization_members m
    WHERE m.organization_id=NEW.organization_id AND m.profile_id=NEW.recipient_profile_id AND m.role='STUDENT' AND m.state<>'NORMAL') THEN
    IF TG_OP='UPDATE' AND NEW.alimtalk_status='SENDING' AND OLD.alimtalk_status IS DISTINCT FROM 'SENDING' THEN RETURN NULL; END IF;
    NEW.delivery_cancelled_at := coalesce(NEW.delivery_cancelled_at,now());
    IF NEW.alimtalk_status IN ('PENDING','SENDING','FAILED') THEN NEW.alimtalk_status := 'FAILED'; END IF;
    IF NEW.email_status IN ('PENDING','FAILED') THEN NEW.email_status := 'SKIPPED'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_student_notification_delivery BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.guard_student_notification_delivery();
REVOKE ALL ON FUNCTION public.guard_student_notification_delivery() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.can_read_graduated_student_history(p_org uuid,p_student uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_student=public.get_current_profile_id() AND EXISTS(SELECT 1 FROM public.organization_members
    WHERE organization_id=p_org AND profile_id=p_student AND role='STUDENT' AND state='GRADUATE');
$$;
REVOKE ALL ON FUNCTION public.can_read_graduated_student_history(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_graduated_student_history(uuid,uuid) TO authenticated;
CREATE POLICY graduated_student_history ON public.schedules FOR SELECT TO authenticated USING (
  student_id=(SELECT public.get_current_profile_id()) AND end_time<=now()
  AND public.can_read_graduated_student_history(organization_id,student_id));
CREATE POLICY graduated_student_program ON public.programs FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.schedules s WHERE s.program_id=programs.program_id AND s.organization_id=programs.organization_id
    AND s.student_id=(SELECT public.get_current_profile_id()) AND s.end_time<=now()
    AND public.can_read_graduated_student_history(s.organization_id,s.student_id)));
CREATE POLICY graduated_student_instructor ON public.instructors FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.programs p JOIN public.schedules s ON s.program_id=p.program_id AND s.organization_id=p.organization_id
    WHERE p.instructor_id=instructors.instructor_id AND p.organization_id=instructors.organization_id
      AND s.student_id=(SELECT public.get_current_profile_id()) AND s.end_time<=now()
      AND public.can_read_graduated_student_history(s.organization_id,s.student_id)));
--> statement-breakpoint
INSERT INTO public.student_account_access(profile_id,blocked,valid_after)
SELECT DISTINCT profile_id,true,ceil(extract(epoch FROM clock_timestamp()))::bigint FROM public.organization_members WHERE role='STUDENT' AND state='DELETED';
DO $$ BEGIN
  IF to_regclass('auth.sessions') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.sessions s USING public.profiles p,public.student_account_access a WHERE a.profile_id=p.profile_id AND a.blocked AND s.user_id=p.auth_user_id';
  END IF;
END $$;


--> statement-breakpoint
ALTER POLICY "student-select-own-schedules-policy" ON public.schedules USING (
  student_id=(SELECT public.get_current_profile_id()) AND public.is_org_member(organization_id));
ALTER POLICY "student-delete-own-schedules-policy" ON public.schedules USING (
  student_id=(SELECT public.get_current_profile_id()) AND public.is_org_member(organization_id)
  AND (start_time AT TIME ZONE 'Asia/Seoul')::date>(now() AT TIME ZONE 'Asia/Seoul')::date);

--> statement-breakpoint
-- Return the already-needed profile with the revocation decision in one round trip.
CREATE FUNCTION public.get_account_auth_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('allowed',public.is_account_access_allowed(),
    'profile',CASE WHEN public.is_account_access_allowed() THEN
      (SELECT to_jsonb(p) FROM public.profiles p WHERE p.auth_user_id=auth.uid()) ELSE NULL END);
$$;
REVOKE ALL ON FUNCTION public.get_account_auth_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_account_auth_context() TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.get_account_org_ids(p_role public.user_role,p_states public.user_state[]) RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(organization_id),'{}'::uuid[]) FROM public.organization_members
  WHERE profile_id=public.get_current_profile_id() AND role=p_role AND state=ANY(p_states);
$$;
REVOKE ALL ON FUNCTION public.get_account_org_ids(public.user_role,public.user_state[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_account_org_ids(public.user_role,public.user_state[]) TO authenticated;
DROP POLICY graduated_student_history ON public.schedules;
ALTER POLICY "student-select-own-schedules-policy" ON public.schedules USING (
  student_id=(SELECT public.get_current_profile_id()) AND (
    organization_id=ANY((SELECT public.get_account_org_ids('STUDENT',ARRAY['NORMAL']::public.user_state[]))::uuid[])
    OR (end_time<=now() AND organization_id=ANY((SELECT public.get_account_org_ids('STUDENT',ARRAY['GRADUATE']::public.user_state[]))::uuid[]))));
ALTER POLICY "student-delete-own-schedules-policy" ON public.schedules USING (
  student_id=(SELECT public.get_current_profile_id())
  AND organization_id=ANY((SELECT public.get_account_org_ids('STUDENT',ARRAY['NORMAL']::public.user_state[]))::uuid[])
  AND (start_time AT TIME ZONE 'Asia/Seoul')::date>(now() AT TIME ZONE 'Asia/Seoul')::date);
-- The same constant privilege checks used to execute once per row. Keep the
-- predicates intact but turn constant role/membership checks into InitPlans.
DO $$ DECLARE p record; q text; c text; BEGIN
  FOR p IN SELECT schemaname,tablename,policyname,qual,with_check FROM pg_policies WHERE schemaname='public' LOOP
    q := regexp_replace(p.qual,'(public\.)?is_super_admin\(\)','(SELECT public.is_super_admin())','g');
    c := regexp_replace(p.with_check,'(public\.)?is_super_admin\(\)','(SELECT public.is_super_admin())','g');
    q := regexp_replace(q,'(public\.)?is_org_admin\(organization_id\)',E'(organization_id = ANY ((SELECT public.get_account_org_ids(''ADMIN'', ARRAY[''NORMAL'']::public.user_state[]))::uuid[]))','g');
    c := regexp_replace(c,'(public\.)?is_org_admin\(organization_id\)',E'(organization_id = ANY ((SELECT public.get_account_org_ids(''ADMIN'', ARRAY[''NORMAL'']::public.user_state[]))::uuid[]))','g');
    IF q IS DISTINCT FROM p.qual OR c IS DISTINCT FROM p.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I %s %s',p.policyname,p.schemaname,p.tablename,
        CASE WHEN q IS NULL THEN '' ELSE 'USING ('||q||')' END,
        CASE WHEN c IS NULL THEN '' ELSE 'WITH CHECK ('||c||')' END);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_active_student_invite() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || NEW.organization_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || NEW.profile_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.organization_members WHERE organization_id=NEW.organization_id AND profile_id=NEW.profile_id AND role='STUDENT' AND state='NORMAL') THEN
    RAISE EXCEPTION 'student_not_eligible';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_active_student_invite BEFORE INSERT OR UPDATE OF organization_id,profile_id ON public.student_invites
FOR EACH ROW EXECUTE FUNCTION public.guard_active_student_invite();
REVOKE ALL ON FUNCTION public.guard_active_student_invite() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
-- A series is one write transaction, including its parent and every occurrence.
CREATE FUNCTION public.create_admin_schedule_series(p_org uuid,p_student uuid,p_program bigint,p_rows jsonb,p_rrule text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; root bigint;
BEGIN
  IF NOT public.is_org_admin(p_org) THEN RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE='42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'schedule_invalid_batch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || p_org::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || p_student::text,0));
  INSERT INTO public.schedules(organization_id,student_id,program_id,start_time,end_time,rrule)
  VALUES(p_org,p_student,p_program,(p_rows->0->>'start_time')::timestamptz,(p_rows->0->>'end_time')::timestamptz,p_rrule)
  RETURNING schedule_id INTO root;
  FOR r IN SELECT (value->>'start_time')::timestamptz start_time,(value->>'end_time')::timestamptz end_time FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS x(value,ord) WHERE ord>1 LOOP
    INSERT INTO public.schedules(organization_id,student_id,program_id,start_time,end_time,parent_schedule_id)
    VALUES(p_org,p_student,p_program,r.start_time,r.end_time,CASE WHEN p_rrule IS NOT NULL THEN root END);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.create_admin_schedule_series(uuid,uuid,bigint,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_admin_schedule_series(uuid,uuid,bigint,jsonb,text) TO authenticated;
CREATE FUNCTION public.update_admin_schedule_batch(p_org uuid,p_student uuid,p_program bigint,p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_org_admin(p_org) THEN RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE='42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'schedule_invalid_batch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:' || p_org::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:' || p_student::text,0));
  SELECT count(DISTINCT s.schedule_id) INTO n FROM public.schedules s JOIN jsonb_to_recordset(p_rows) AS x(schedule_id bigint) USING(schedule_id)
    WHERE s.organization_id=p_org AND (s.start_time AT TIME ZONE 'Asia/Seoul')::date>=(now() AT TIME ZONE 'Asia/Seoul')::date;
  IF n<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'schedule_batch_target_not_eligible'; END IF;
  UPDATE public.schedules s SET student_id=p_student,program_id=p_program,start_time=x.start_time,end_time=x.end_time,is_exception=coalesce(x.is_exception,s.is_exception)
  FROM jsonb_to_recordset(p_rows) AS x(schedule_id bigint,start_time timestamptz,end_time timestamptz,is_exception boolean)
  WHERE s.schedule_id=x.schedule_id AND s.organization_id=p_org;
END $$;
REVOKE ALL ON FUNCTION public.update_admin_schedule_batch(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_admin_schedule_batch(uuid,uuid,bigint,jsonb) TO authenticated;
--> statement-breakpoint
CREATE POLICY graduated_student_organization ON public.organizations FOR SELECT TO authenticated USING (
  organization_id=ANY((SELECT public.get_account_org_ids('STUDENT',ARRAY['GRADUATE']::public.user_state[]))::uuid[]));
