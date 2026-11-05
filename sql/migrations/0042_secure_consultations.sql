-- Preserve all historical consultation/notification rows. Public writes remain server-only.
CREATE TABLE public.consult_rate_limits (
  bucket_key text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX consult_rate_limits_expiry ON public.consult_rate_limits(expires_at);
CREATE TABLE public.consult_submission_keys (
  request_id uuid PRIMARY KEY,
  payload_hash text NOT NULL,
  notification_id bigint NOT NULL REFERENCES public.notifications(notification_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
ALTER TABLE public.consult_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_submission_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consult_rate_limits, public.consult_submission_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.consult_rate_limits, public.consult_submission_keys TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.consume_consult_limit(p_key text, p_limit integer, p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer; v_bucket text;
BEGIN
  IF p_key IS NULL OR length(p_key) > 200 OR p_limit < 1 OR p_seconds < 1 THEN
    RAISE EXCEPTION 'invalid_consult_limit';
  END IF;
  v_bucket := p_key || ':' || floor(extract(epoch FROM now()) / p_seconds)::text;
  DELETE FROM public.consult_rate_limits WHERE expires_at < now();
  INSERT INTO public.consult_rate_limits(bucket_key, attempts, expires_at)
    VALUES(v_bucket, 1, now() + make_interval(secs => p_seconds * 2))
  ON CONFLICT(bucket_key) DO UPDATE SET attempts = public.consult_rate_limits.attempts + 1
    WHERE public.consult_rate_limits.attempts < p_limit
  RETURNING attempts INTO v_count;
  RETURN v_count IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.consume_consult_limit(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_consult_limit(text,integer,integer) TO service_role;
--> statement-breakpoint
-- Existing schedule events and deployed schedule workers remain compatible.
ALTER TABLE public.push_events ALTER COLUMN instructor_id DROP NOT NULL;
ALTER TABLE public.push_events ALTER COLUMN actor_profile_id DROP NOT NULL;
ALTER TABLE public.push_events ALTER COLUMN schedule_id DROP NOT NULL;
ALTER TABLE public.push_events ADD COLUMN notification_id bigint REFERENCES public.notifications(notification_id) ON DELETE CASCADE;
ALTER TABLE public.push_events DROP CONSTRAINT push_events_event_type_check;
ALTER TABLE public.push_events ADD CONSTRAINT push_events_event_type_check CHECK(event_type IN ('BOOKED','CANCELLED','CONSULT_REQUEST'));
ALTER TABLE public.push_events ADD CONSTRAINT push_events_source_check CHECK (
  (event_type = 'CONSULT_REQUEST' AND notification_id IS NOT NULL AND schedule_id IS NULL AND instructor_id IS NULL AND actor_profile_id IS NULL)
  OR (event_type IN ('BOOKED','CANCELLED') AND schedule_id IS NOT NULL AND instructor_id IS NOT NULL AND actor_profile_id IS NOT NULL AND notification_id IS NULL)
);
CREATE UNIQUE INDEX push_events_consult_recipient ON public.push_events(notification_id,recipient_profile_id) WHERE notification_id IS NOT NULL;
-- Older production workers must not claim preview-only consultation events.
ALTER TABLE public.push_deliveries DROP CONSTRAINT push_deliveries_status_check;
ALTER TABLE public.push_deliveries ADD CONSTRAINT push_deliveries_status_check
  CHECK(status IN ('PENDING','SENDING','CONSULT_PENDING','CONSULT_SENDING','SENT','FAILED','SKIPPED'));
CREATE INDEX consult_deliveries_pending_idx ON public.push_deliveries(next_attempt_at) WHERE status IN ('CONSULT_PENDING','CONSULT_SENDING');
--> statement-breakpoint
-- Replace the legacy paid-message fanout. Bell and push outbox commit with the consultation.
CREATE OR REPLACE FUNCTION public.on_consult_request_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_recipient uuid; v_event uuid;
BEGIN
  IF NEW.type <> 'CONSULT_REQUEST' THEN RETURN NEW; END IF;
  INSERT INTO public.in_app_notifications(organization_id,notification_id,message,template_type)
    VALUES(NEW.organization_id,NEW.notification_id,'새로운 상담 신청이 접수되었습니다.','SYS_CONSULT_ADMIN');
  FOR v_recipient IN SELECT m.profile_id FROM public.organization_members m
    JOIN public.profiles p USING(profile_id)
    WHERE m.organization_id=NEW.organization_id AND m.role='ADMIN' AND m.state='NORMAL'
      AND p.auth_user_id IS NOT NULL
  LOOP
    INSERT INTO public.push_events(organization_id,recipient_profile_id,notification_id,event_type,title,body)
      VALUES(NEW.organization_id,v_recipient,NEW.notification_id,'CONSULT_REQUEST','새 상담 신청','새로운 상담 신청이 접수되었습니다. 상담관리에서 확인해 주세요.')
      RETURNING event_id INTO v_event;
    INSERT INTO public.push_deliveries(event_id,subscription_id,status)
      SELECT v_event,subscription_id,'CONSULT_PENDING' FROM public.push_subscriptions
      WHERE organization_id=NEW.organization_id AND profile_id=v_recipient AND (expires_at IS NULL OR expires_at>now());
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.on_consult_request_insert() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.submit_public_consultation(
  p_program bigint,p_name text,p_phone text,p_message text,p_request uuid,p_hash text,p_phone_hash text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; v_id bigint; v_hash text;
BEGIN
  IF p_request IS NULL OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR p_phone_hash IS NULL OR p_phone_hash !~ '^[a-f0-9]{64}$'
    OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100
    OR p_phone IS NULL OR p_phone !~ '^0[0-9]{9,10}$'
    OR length(coalesce(p_message,'')) > 2000 THEN RAISE EXCEPTION 'consult_invalid_input'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('consult:' || p_request::text,0));
  DELETE FROM public.consult_submission_keys WHERE expires_at < now();
  SELECT notification_id,payload_hash INTO v_id,v_hash FROM public.consult_submission_keys WHERE request_id=p_request;
  IF FOUND THEN
    IF v_hash <> p_hash THEN RAISE EXCEPTION 'consult_request_conflict'; END IF;
    RETURN v_id;
  END IF;
  SELECT organization_id INTO v_org FROM public.programs
    WHERE program_id=p_program AND is_public IS TRUE AND status='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'consult_program_unavailable'; END IF;
  -- Counters and insert are atomic. The IP budget is consumed separately before submission.
  IF NOT public.consume_consult_limit('phone:' || v_org::text || ':' || p_phone_hash,3,3600)
    OR NOT public.consume_consult_limit('org:' || v_org::text,100,3600) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.notifications(organization_id,type,recipient_name,recipient_phone,program_id,consult_status,consult_message)
    VALUES(v_org,'CONSULT_REQUEST',trim(p_name),p_phone,p_program,'WAITING',coalesce(p_message,''))
    RETURNING notification_id INTO v_id;
  INSERT INTO public.consult_submission_keys(request_id,payload_hash,notification_id) VALUES(p_request,p_hash,v_id);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_public_consultation(bigint,text,text,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_consultation(bigint,text,text,text,uuid,text,text) TO service_role;
--> statement-breakpoint
-- RLS scopes rows; this invoker trigger also scopes editable columns.
CREATE FUNCTION public.protect_consult_fields() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.type <> 'CONSULT_REQUEST' THEN RETURN NEW; END IF;
  IF NEW.consult_status IS NULL THEN RAISE EXCEPTION 'consult_status_required'; END IF;
  IF current_user NOT IN ('postgres','supabase_admin','service_role') AND
    (to_jsonb(NEW) - ARRAY['consult_status','consult_result','consult_notes','consult_completed_at','consult_completed_by','updated_at'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['consult_status','consult_result','consult_notes','consult_completed_at','consult_completed_by','updated_at']) THEN
    RAISE EXCEPTION 'consult_immutable_fields' USING ERRCODE='42501';
  END IF;
  IF length(coalesce(NEW.consult_notes,'')) > 5000 THEN RAISE EXCEPTION 'consult_notes_too_long'; END IF;
  IF NEW.consult_status IS DISTINCT FROM OLD.consult_status THEN
    NEW.consult_completed_at := CASE WHEN NEW.consult_status='COMPLETED' THEN now() END;
    NEW.consult_completed_by := CASE WHEN NEW.consult_status='COMPLETED' THEN public.get_current_profile_id() END;
  ELSE
    NEW.consult_completed_at := OLD.consult_completed_at;
    NEW.consult_completed_by := OLD.consult_completed_by;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_consult_fields BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.protect_consult_fields();
REVOKE ALL ON FUNCTION public.protect_consult_fields() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
-- Configure the stable preview URL in Vault when activating this change.
-- A separate retry job leaves the deployed production schedule worker unchanged.
SELECT cron.schedule('consult-push-retry-job','* * * * *',$job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='lestly_consult_push_app_url') || '/api/cron/push',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='lestly_web_push_cron_secret')),
    body := '{}'::jsonb
  ) WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='lestly_consult_push_app_url')
    AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='lestly_web_push_cron_secret');
$job$);
