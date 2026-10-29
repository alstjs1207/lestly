-- Phase 5: the constant default preserves the previous-day rule for existing
-- reservations without rewriting their other data. New inserts snapshot settings.
ALTER TABLE public.schedules ADD COLUMN cancellation_policy jsonb NOT NULL DEFAULT '{"mode":"previous_day"}'::jsonb;
--> statement-breakpoint
CREATE FUNCTION public.validate_cancellation_policy(p jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_cancellation_policy' USING ERRCODE='22023'; END IF;
 IF p->>'mode'='previous_day' THEN
   IF p <> '{"mode":"previous_day"}'::jsonb THEN RAISE EXCEPTION 'invalid_cancellation_policy' USING ERRCODE='22023'; END IF;
 ELSIF p->>'mode'='hours_before' THEN
   IF NOT p ?& ARRAY['mode','hours'] OR p-ARRAY['mode','hours'] <> '{}'::jsonb
     OR jsonb_typeof(p->'hours') IS DISTINCT FROM 'number' OR coalesce(p->>'hours','') !~ '^[0-9]{1,3}$'
     THEN RAISE EXCEPTION 'invalid_cancellation_policy' USING ERRCODE='22023'; END IF;
   IF (p->>'hours')::int NOT BETWEEN 0 AND 720 THEN RAISE EXCEPTION 'invalid_cancellation_policy' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'invalid_cancellation_policy' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.validate_cancellation_policy(jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.read_cancellation_policy(p_org uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT setting_value FROM public.settings WHERE organization_id=p_org AND setting_key='cancellation_policy'),'{"mode":"previous_day"}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.read_cancellation_policy(uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
-- Pure predicate used by RLS and the booking confirmation RPC. No table access.
CREATE FUNCTION public.cancellation_allowed(p_start timestamptz,p_policy jsonb,p_now timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(isfinite(p_start) AND isfinite(p_now) AND p_now < p_start AND CASE
   WHEN p_policy = '{"mode":"previous_day"}'::jsonb THEN
     (p_now AT TIME ZONE 'Asia/Seoul')::date < (p_start AT TIME ZONE 'Asia/Seoul')::date
   WHEN jsonb_typeof(p_policy)='object' AND p_policy->>'mode'='hours_before'
     AND p_policy ?& ARRAY['mode','hours'] AND p_policy-ARRAY['mode','hours']='{}'::jsonb
     AND jsonb_typeof(p_policy->'hours')='number' AND coalesce(p_policy->>'hours','') ~ '^[0-9]{1,3}$'
     THEN CASE WHEN (p_policy->>'hours')::int BETWEEN 0 AND 720
       THEN p_now <= p_start-make_interval(hours=>(p_policy->>'hours')::int) ELSE false END
   ELSE false END,false);
$$;
REVOKE ALL ON FUNCTION public.cancellation_allowed(timestamptz,jsonb,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancellation_allowed(timestamptz,jsonb,timestamptz) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_booking_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END; x jsonb;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.setting_key) IS DISTINCT FROM (OLD.organization_id,OLD.setting_key) THEN RAISE EXCEPTION 'setting_identity_not_allowed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:'||org::text,0));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.setting_key='booking_policy' THEN PERFORM public.validate_booking_policy(NEW.setting_value);
 ELSIF NEW.setting_key='cancellation_policy' THEN PERFORM public.validate_cancellation_policy(NEW.setting_value);
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
CREATE FUNCTION public.stamp_schedule_cancellation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   -- Same lock order as guard_schedule_write; read after the settings lock.
   PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:'||NEW.organization_id::text,0));
   NEW.cancellation_policy := public.read_cancellation_policy(NEW.organization_id);
   PERFORM public.validate_cancellation_policy(NEW.cancellation_policy);
 ELSIF NEW.cancellation_policy IS DISTINCT FROM OLD.cancellation_policy THEN
   RAISE EXCEPTION 'schedule_cancellation_policy_immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_schedule_cancellation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER stamp_schedule_cancellation BEFORE INSERT OR UPDATE ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.stamp_schedule_cancellation();
--> statement-breakpoint
ALTER POLICY "public-select-org-settings-policy" ON public.settings USING (
 public.is_org_member(organization_id) AND setting_key IN ('max_concurrent_students','schedule_duration_hours','time_slot_interval_minutes','disabled_booking_start_times','disabled_booking_weekdays','booking_policy','booking_window','cancellation_policy')
);
ALTER POLICY "student-delete-own-schedules-policy" ON public.schedules USING (
 student_id=(SELECT public.get_current_profile_id())
 AND organization_id=ANY((SELECT public.get_account_org_ids('STUDENT',ARRAY['NORMAL']::public.user_state[]))::uuid[])
 AND cancelled_at IS NULL
 AND public.cancellation_allowed(start_time,cancellation_policy,clock_timestamp())
);
--> statement-breakpoint
-- New clients confirm the exact policy shown and explicitly acknowledge a
-- reservation whose cancellation deadline has already passed. The old RPC stays
-- compatible during the preview rollout; both paths snapshot/enforce DB policy.
CREATE FUNCTION public.book_student_schedule_with_policy(
 p_organization_id uuid,p_program_id bigint,p_start_time timestamptz,p_end_time timestamptz,
 p_expected_cancellation_policy jsonb,p_accept_no_cancellation boolean
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_student uuid := public.get_current_profile_id(); v_policy jsonb;
BEGIN
 IF auth.uid() IS NULL OR v_student IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.organization_members WHERE organization_id=p_organization_id
   AND profile_id=v_student AND role='STUDENT' AND state='NORMAL'
 ) THEN RAISE EXCEPTION 'schedule_not_authorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:'||p_organization_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-student:'||v_student::text,0));
 v_policy := public.read_cancellation_policy(p_organization_id);
 PERFORM public.validate_cancellation_policy(v_policy);
 IF p_expected_cancellation_policy IS DISTINCT FROM v_policy THEN
   RAISE EXCEPTION 'schedule_cancellation_policy_changed';
 END IF;
 IF NOT public.cancellation_allowed(p_start_time,v_policy,clock_timestamp()) AND p_accept_no_cancellation IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'schedule_cancellation_ack_required';
 END IF;
 RETURN public.book_student_schedule(p_organization_id,p_program_id,p_start_time,p_end_time);
END $$;
REVOKE ALL ON FUNCTION public.book_student_schedule_with_policy(uuid,bigint,timestamptz,timestamptz,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.book_student_schedule_with_policy(uuid,bigint,timestamptz,timestamptz,jsonb,boolean) TO authenticated;
--> statement-breakpoint
NOTIFY pgrst,'reload schema';
