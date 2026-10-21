-- Forward-only hardening. Do not rewrite tenant data while installing this
-- migration. NOT VALID constraints protect new writes; audit existing rows
-- with sql/checks/tenant_integrity.sql before validating those constraints.

-- RLS membership helpers search by profile first, while the membership PK
-- starts with organization_id. Calendar queries always filter organization
-- and a time range; student history queries filter student and time.
CREATE INDEX IF NOT EXISTS organization_members_profile_org_idx
  ON public.organization_members (profile_id, organization_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedules_org_start_idx
  ON public.schedules (organization_id, start_time);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedules_student_start_idx
  ON public.schedules (student_id, start_time);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS schedules_parent_idx
  ON public.schedules (parent_schedule_id)
  WHERE parent_schedule_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS programs_instructor_idx
  ON public.programs (instructor_id)
  WHERE instructor_id IS NOT NULL;
--> statement-breakpoint

-- Independent FKs checked existence only, allowing references into another
-- tenant. Keep the original SET NULL FKs for deletion behavior and add
-- deferred tenant FKs that check the remaining references at transaction end.
ALTER TABLE public.programs
  ADD CONSTRAINT programs_id_org_unique UNIQUE (program_id, organization_id);
--> statement-breakpoint
ALTER TABLE public.instructors
  ADD CONSTRAINT instructors_id_org_unique UNIQUE (instructor_id, organization_id);
--> statement-breakpoint
ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_id_org_unique UNIQUE (schedule_id, organization_id);
--> statement-breakpoint
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_id_org_unique UNIQUE (notification_id, organization_id);
--> statement-breakpoint
ALTER TABLE public.programs
  ADD CONSTRAINT programs_instructor_tenant_fk
  FOREIGN KEY (instructor_id, organization_id)
  REFERENCES public.instructors (instructor_id, organization_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;
--> statement-breakpoint
ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_program_tenant_fk
  FOREIGN KEY (program_id, organization_id)
  REFERENCES public.programs (program_id, organization_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT schedules_valid_time_range
  CHECK (end_time > start_time) NOT VALID;
--> statement-breakpoint
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_program_tenant_fk
  FOREIGN KEY (program_id, organization_id)
  REFERENCES public.programs (program_id, organization_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT notifications_schedule_tenant_fk
  FOREIGN KEY (schedule_id, organization_id)
  REFERENCES public.schedules (schedule_id, organization_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID,
  ADD CONSTRAINT notifications_parent_tenant_fk
  FOREIGN KEY (parent_notification_id, organization_id)
  REFERENCES public.notifications (notification_id, organization_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;
--> statement-breakpoint
ALTER TABLE public.in_app_notifications
  ADD CONSTRAINT in_app_notifications_notification_tenant_fk
  FOREIGN KEY (notification_id, organization_id)
  REFERENCES public.notifications (notification_id, organization_id)
  DEFERRABLE INITIALLY DEFERRED NOT VALID;
--> statement-breakpoint
ALTER TABLE public.student_invites
  ADD CONSTRAINT student_invites_member_tenant_fk
  FOREIGN KEY (organization_id, profile_id)
  REFERENCES public.organization_members (organization_id, profile_id)
  ON DELETE CASCADE NOT VALID;
--> statement-breakpoint

-- A member can access active programs in every organization they belong to.
-- Selecting an arbitrary first membership caused valid N:N memberships to fail.
ALTER POLICY "student-select-active-programs-policy" ON public.programs
  USING (public.is_org_member(organization_id) AND status = 'ACTIVE');
--> statement-breakpoint

-- Admins cannot attach an arbitrary existing profile to an organization to
-- gain access to that person's details. Only the trusted server manages new
-- memberships; existing admins may still change role/state/type in their org.
DROP POLICY IF EXISTS "admin-insert-org-memberships-policy"
  ON public.organization_members;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.protect_membership_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (OLD.organization_id IS DISTINCT FROM NEW.organization_id
      OR OLD.profile_id IS DISTINCT FROM NEW.profile_id)
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RAISE EXCEPTION 'membership_identity_update_not_allowed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER protect_membership_identity
BEFORE UPDATE OF organization_id, profile_id ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.protect_membership_identity();
--> statement-breakpoint

-- The administrator must book an active student in the selected tenant.
-- Student RLS already restricts self-booking; this also covers admin writes
-- and service-role writes used by calendar endpoints.
CREATE OR REPLACE FUNCTION public.check_schedule_student_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = NEW.organization_id
      AND om.profile_id = NEW.student_id
      AND om.role = 'STUDENT'
      AND om.state = 'NORMAL'
  ) THEN
    RAISE EXCEPTION 'schedule_student_not_eligible';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER check_schedule_student_membership
BEFORE INSERT OR UPDATE OF organization_id, student_id ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.check_schedule_student_membership();
--> statement-breakpoint

-- Consultation requests go through the public server endpoint, which checks
-- the public program and validates input. Direct anon table inserts bypassed
-- that endpoint and could also forge notification status/identity fields.
DROP POLICY IF EXISTS "anon_insert_consult_notifications" ON public.notifications;
REVOKE INSERT ON public.notifications FROM anon;
--> statement-breakpoint

-- Invite creation/revocation uses server routes with authorization checks.
-- Removing direct client mutation prevents retargeting or forging identity
-- links. Reading an admin's own tenant invite records remains allowed.
DROP POLICY IF EXISTS "admin-insert-student-invites-policy"
  ON public.student_invites;
--> statement-breakpoint
DROP POLICY IF EXISTS "admin-update-student-invites-policy"
  ON public.student_invites;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.claim_student_invite(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_invite public.student_invites%ROWTYPE;
  v_target_auth_user_id uuid;
  v_bootstrap_profile_id uuid;
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT * INTO v_invite FROM public.student_invites
  WHERE token_hash = p_token_hash FOR UPDATE;
  IF v_invite.invite_id IS NULL
     OR v_invite.used_at IS NOT NULL
     OR v_invite.revoked_at IS NOT NULL
     OR v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_or_expired_invite';
  END IF;

  -- Different invites for the same student must serialize on the profile
  -- before checking its Auth link. Locking the invite alone is insufficient.
  SELECT p.auth_user_id INTO v_target_auth_user_id
  FROM public.profiles p
  WHERE p.profile_id = v_invite.profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'student_not_eligible';
  END IF;
  IF v_target_auth_user_id IS NOT NULL
     AND v_target_auth_user_id <> v_auth_user_id THEN
    RAISE EXCEPTION 'student_already_linked';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_invite.organization_id
      AND om.profile_id = v_invite.profile_id
      AND om.role = 'STUDENT' AND om.state = 'NORMAL'
  ) THEN
    RAISE EXCEPTION 'student_not_eligible';
  END IF;

  SELECT p.profile_id INTO v_bootstrap_profile_id
  FROM public.profiles p
  WHERE p.auth_user_id = v_auth_user_id FOR UPDATE;
  IF v_bootstrap_profile_id IS NOT NULL
     AND v_bootstrap_profile_id <> v_invite.profile_id THEN
    IF EXISTS (SELECT 1 FROM public.organization_members om
               WHERE om.profile_id = v_bootstrap_profile_id) THEN
      RAISE EXCEPTION 'account_already_in_use';
    END IF;
    DELETE FROM public.profiles WHERE profile_id = v_bootstrap_profile_id;
  END IF;

  UPDATE public.profiles SET auth_user_id = v_auth_user_id, updated_at = now()
  WHERE profile_id = v_invite.profile_id;
  UPDATE public.student_invites SET used_at = now()
  WHERE invite_id = v_invite.invite_id;
  RETURN v_invite.profile_id;
END;
$$;
--> statement-breakpoint

-- Signup metadata is untrusted. Invalid strings must not abort Auth signup,
-- and consent is opt-in. Metadata never determines organization privileges.
CREATE OR REPLACE FUNCTION public.handle_sign_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    profile_id, auth_user_id, contact_email, name, avatar_url, marketing_consent
  ) VALUES (
    NEW.id, NEW.id, NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
             NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'Anonymous'),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    COALESCE(lower(NEW.raw_user_meta_data ->> 'marketing_consent') = 'true', false)
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Aggregate in the database so PostgREST's row limit cannot truncate total
-- hours. Invoker privileges intentionally preserve schedule RLS for callers.
CREATE OR REPLACE FUNCTION public.get_student_total_hours(
  p_student_ids uuid[], p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (student_id uuid, total_hours double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT s.student_id,
         SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600.0)::double precision
  FROM public.schedules s
  WHERE s.student_id = ANY(p_student_ids)
    AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
    AND s.start_time <= now()
    AND s.end_time > s.start_time
  GROUP BY s.student_id;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.claim_student_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_student_invite(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_student_total_hours(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_total_hours(uuid[], uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_sign_up() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_schedule_student_membership()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_membership_identity()
  FROM PUBLIC, anon, authenticated;

--> statement-breakpoint
-- Keep maintained helper definitions consistent with the profile/Auth split.
CREATE OR REPLACE FUNCTION public.is_same_organization(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_org_member(target_org_id);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT om.organization_id
  FROM public.organization_members om
  JOIN public.profiles p ON p.profile_id = om.profile_id
  WHERE p.auth_user_id = auth.uid() AND om.state = 'NORMAL'
  ORDER BY om.organization_id;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.get_user_organizations() AS membership(organization_id) LIMIT 1;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    JOIN public.profiles p ON p.profile_id = om.profile_id
    WHERE p.auth_user_id = auth.uid()
      AND om.role = 'ADMIN' AND om.state = 'NORMAL'
  );
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_current_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_profile_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_organizations() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_user_organization_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_same_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_same_organization(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

--> statement-breakpoint
-- Harden the optional existing welcome-email trigger without activating it.
-- Optional signup trigger. Enqueue only the template fields; never copy the
-- auth.users row (password hashes, reset tokens and authentication metadata).
CREATE OR REPLACE FUNCTION public.welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    PERFORM pgmq.send(
      queue_name => 'mailer'::text,
      msg => jsonb_build_object(
        'template', 'welcome',
        'to', NEW.email,
        'data', jsonb_build_object(
          'name', COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
                           NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), '회원')
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.welcome_email() FROM PUBLIC, anon, authenticated;
