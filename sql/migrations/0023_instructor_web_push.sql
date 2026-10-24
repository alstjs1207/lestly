-- Web Push is independent of notifications, AlimTalk templates and email.
ALTER TABLE public.instructors ADD COLUMN push_profile_id uuid
  REFERENCES public.profiles(profile_id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE FUNCTION public.check_instructor_push_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.push_profile_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members m JOIN public.profiles p USING (profile_id)
    WHERE m.organization_id = NEW.organization_id AND m.profile_id = NEW.push_profile_id
      AND m.role = 'ADMIN' AND m.state = 'NORMAL' AND p.auth_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'instructor_push_account_not_eligible' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_instructor_push_account BEFORE INSERT OR UPDATE OF push_profile_id, organization_id
ON public.instructors FOR EACH ROW EXECUTE FUNCTION public.check_instructor_push_account();
REVOKE ALL ON FUNCTION public.check_instructor_push_account() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TABLE public.push_subscriptions (
  subscription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  device_id uuid NOT NULL UNIQUE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, profile_id)
    REFERENCES public.organization_members(organization_id, profile_id) ON DELETE CASCADE
);
CREATE INDEX push_subscriptions_recipient_idx ON public.push_subscriptions(organization_id, profile_id);
--> statement-breakpoint
CREATE TABLE public.push_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  instructor_id bigint NOT NULL,
  recipient_profile_id uuid NOT NULL,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(profile_id) ON DELETE CASCADE,
  -- No FK to schedules: cancellation must retain the deleted schedule snapshot.
  schedule_id bigint NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('BOOKED', 'CANCELLED')),
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, event_type),
  FOREIGN KEY (instructor_id, organization_id)
    REFERENCES public.instructors(instructor_id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, recipient_profile_id)
    REFERENCES public.organization_members(organization_id, profile_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE public.push_deliveries (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.push_events(event_id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(subscription_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  claim_token uuid,
  last_error text,
  sent_at timestamptz,
  UNIQUE(event_id, subscription_id)
);
CREATE INDEX push_deliveries_pending_idx ON public.push_deliveries(next_attempt_at)
  WHERE status IN ('PENDING', 'SENDING');
--> statement-breakpoint
-- Only authenticated server routes and the worker may read subscription secrets
-- or modify delivery state. Ordinary browser clients have no table grants/policies.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions, public.push_events, public.push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_subscriptions, public.push_events, public.push_deliveries TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.enqueue_instructor_schedule_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_schedule public.schedules%ROWTYPE;
  v_actor uuid := public.get_current_profile_id();
  v_instructor bigint;
  v_recipient uuid;
  v_program text;
  v_student text;
  v_event uuid;
  v_type text := CASE WHEN TG_OP = 'INSERT' THEN 'BOOKED' ELSE 'CANCELLED' END;
BEGIN
  IF TG_OP = 'DELETE' THEN v_schedule := OLD; ELSE v_schedule := NEW; END IF;
  -- Do not notify for admin changes, service operations or another student's work.
  IF auth.uid() IS NULL OR v_actor IS DISTINCT FROM v_schedule.student_id OR NOT EXISTS (
    SELECT 1 FROM public.organization_members WHERE organization_id = v_schedule.organization_id
      AND profile_id = v_actor AND role = 'STUDENT' AND state = 'NORMAL'
  ) THEN RETURN NULL; END IF;

  SELECT i.instructor_id, i.push_profile_id, p.title INTO v_instructor, v_recipient, v_program
  FROM public.programs p JOIN public.instructors i
    ON i.instructor_id = p.instructor_id AND i.organization_id = p.organization_id
  JOIN public.organization_members m
    ON m.organization_id = i.organization_id AND m.profile_id = i.push_profile_id
  JOIN public.profiles recipient ON recipient.profile_id = m.profile_id
  WHERE p.program_id = v_schedule.program_id AND p.organization_id = v_schedule.organization_id
    AND m.role = 'ADMIN' AND m.state = 'NORMAL' AND recipient.auth_user_id IS NOT NULL;
  IF v_recipient IS NULL THEN RETURN NULL; END IF;

  SELECT name INTO v_student FROM public.profiles WHERE profile_id = v_actor;
  INSERT INTO public.push_events(organization_id, instructor_id, recipient_profile_id,
    actor_profile_id, schedule_id, event_type, title, body)
  VALUES(v_schedule.organization_id, v_instructor, v_recipient, v_actor, v_schedule.schedule_id, v_type,
    CASE WHEN v_type = 'BOOKED' THEN '수업 예약 알림' ELSE '수업 취소 알림' END,
    left(coalesce(nullif(trim(v_student), ''), '수강생'), 40) || '님이 ' ||
    to_char(v_schedule.start_time AT TIME ZONE 'Asia/Seoul', 'MM/DD HH24:MI') || ' ' ||
    left(coalesce(v_program, '수업'), 60) || CASE WHEN v_type = 'BOOKED' THEN ' 수업을 예약했습니다.' ELSE ' 수업을 취소했습니다.' END)
  ON CONFLICT (schedule_id, event_type) DO NOTHING RETURNING event_id INTO v_event;

  IF v_event IS NOT NULL THEN
    INSERT INTO public.push_deliveries(event_id, subscription_id)
    SELECT v_event, subscription_id FROM public.push_subscriptions
    WHERE organization_id = v_schedule.organization_id AND profile_id = v_recipient
      AND (expires_at IS NULL OR expires_at > now());
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER enqueue_instructor_schedule_push AFTER INSERT OR DELETE ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.enqueue_instructor_schedule_push();
REVOKE ALL ON FUNCTION public.enqueue_instructor_schedule_push() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
-- Recovery only: the normal student API dispatches immediately after commit.
SELECT cron.schedule('web-push-retry-job', '* * * * *', $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lestly_web_push_app_url') || '/api/cron/push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'lestly_web_push_cron_secret')),
    body := '{}'::jsonb
  );
$$);
