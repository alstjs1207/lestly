-- Keep existing reservations, attendance, notifications and their snapshots intact.
-- parent_schedule_id is a persistent series key: the first reservation may be cancelled.
CREATE FUNCTION public.detach_reassigned_schedule() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
  NEW.parent_schedule_id:=NULL;
  NEW.rrule:=NULL;
  NEW.is_exception:=false;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.detach_reassigned_schedule() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_detach_reassigned_schedule BEFORE UPDATE OF student_id ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.detach_reassigned_schedule();
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
CREATE OR REPLACE FUNCTION public.update_admin_schedule_batch(p_org uuid,p_student uuid,p_program bigint,p_rows jsonb)
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
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_rows) AS x(start_time timestamptz)
    WHERE (x.start_time AT TIME ZONE 'Asia/Seoul')::date<(now() AT TIME ZONE 'Asia/Seoul')::date) THEN
    RAISE EXCEPTION 'schedule_date_not_allowed';
  END IF;
  UPDATE public.schedules s SET student_id=p_student,program_id=p_program,start_time=x.start_time,end_time=x.end_time,is_exception=coalesce(x.is_exception,s.is_exception)
  FROM jsonb_to_recordset(p_rows) AS x(schedule_id bigint,start_time timestamptz,end_time timestamptz,is_exception boolean)
  WHERE s.schedule_id=x.schedule_id AND s.organization_id=p_org;
END $$;
REVOKE ALL ON FUNCTION public.update_admin_schedule_batch(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_admin_schedule_batch(uuid,uuid,bigint,jsonb) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.invalidate_schedule_notices() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target bigint;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.student_id,NEW.program_id,NEW.start_time,NEW.end_time)
   IS NOT DISTINCT FROM (OLD.student_id,OLD.program_id,OLD.start_time,OLD.end_time) THEN RETURN NEW; END IF;
 target:=OLD.schedule_id;
 UPDATE public.notifications n SET delivery_cancelled_at=clock_timestamp(),
   alimtalk_status=CASE WHEN n.alimtalk_status IN ('PENDING','SENDING','FAILED') THEN 'FAILED'::public.alimtalk_status ELSE n.alimtalk_status END,
   alimtalk_error_message=CASE WHEN n.alimtalk_status IN ('PENDING','SENDING','FAILED') THEN 'Reservation cancelled or changed' ELSE n.alimtalk_error_message END,
   email_status=CASE WHEN n.email_status IN ('PENDING','FAILED') THEN 'SKIPPED'::public.email_status ELSE n.email_status END
 WHERE n.schedule_id=target AND n.delivery_cancelled_at IS NULL
   AND (n.reminder_generated IS TRUE OR EXISTS(SELECT 1 FROM public.super_templates t
     WHERE t.kakao_template_code=n.alimtalk_template_code AND t.type IN ('STD_BOOK_ADMIN','ADM_BOOK_STUDENT','SYS_REMIND_STUDENT')))
   AND (n.alimtalk_status IN ('PENDING','SENDING','FAILED') OR n.email_status IN ('PENDING','FAILED'));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_schedule_notices() FROM PUBLIC,anon,authenticated;
-- Runs before creation of the new cancellation notice, so that notice remains deliverable.
CREATE TRIGGER b_invalidate_schedule_notices BEFORE DELETE OR UPDATE OF student_id,program_id,start_time,end_time ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.invalidate_schedule_notices();
--> statement-breakpoint
-- Create a fresh booking notice from the new snapshot, using the existing channel/template policy.
CREATE TRIGGER on_schedule_update_notice AFTER UPDATE OF student_id,program_id,start_time,end_time ON public.schedules
FOR EACH ROW WHEN ((OLD.student_id,OLD.program_id,OLD.start_time,OLD.end_time)
 IS DISTINCT FROM (NEW.student_id,NEW.program_id,NEW.start_time,NEW.end_time))
EXECUTE FUNCTION public.on_schedule_insert();
--> statement-breakpoint
-- Each deleted occurrence needs a cancellation notice, including child occurrences.
DO $$ DECLARE definition text; skip_child text:=E'  IF OLD.parent_schedule_id IS NOT NULL THEN\n    RETURN OLD;\n  END IF;'; BEGIN
 SELECT pg_get_functiondef('public.on_schedule_delete()'::regprocedure) INTO definition;
 IF strpos(definition,skip_child)=0 THEN RAISE EXCEPTION 'unexpected_schedule_cancellation_definition'; END IF;
 EXECUTE replace(definition,skip_child,'');
END $$;
NOTIFY pgrst,'reload schema';
