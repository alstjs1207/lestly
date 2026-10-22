-- Do not merge or delete existing students automatically. Run the read-only
-- check in sql/operations/20261022_student_phone_conflicts.sql first.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.organization_members m JOIN public.profiles p USING (profile_id)
    WHERE m.role = 'STUDENT'
      AND nullif(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
    GROUP BY m.organization_id, regexp_replace(p.phone, '[^0-9]', '', 'g') HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'student_phone_conflicts_require_resolution'; END IF;
END $$;
--> statement-breakpoint
-- Preserve the original phone presentation, and search/compare its digits.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS profiles_phone_normalized_idx ON public.profiles (phone_normalized);
--> statement-breakpoint
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS student_phone text;
--> statement-breakpoint
UPDATE public.organization_members m SET student_phone = p.phone_normalized
FROM public.profiles p WHERE p.profile_id = m.profile_id AND m.role = 'STUDENT'
  AND m.student_phone IS DISTINCT FROM p.phone_normalized;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS organization_student_phone_unique
ON public.organization_members (organization_id, student_phone)
WHERE role = 'STUDENT' AND student_phone IS NOT NULL;
--> statement-breakpoint
-- Lock the profile before copying its phone, so inserting a membership and
-- changing that same profile's phone cannot race and leave a stale key.
CREATE OR REPLACE FUNCTION public.sync_membership_student_phone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.role = 'STUDENT' THEN
    SELECT phone_normalized INTO NEW.student_phone FROM public.profiles
    WHERE profile_id = NEW.profile_id FOR UPDATE;
  ELSE
    NEW.student_phone := NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_membership_student_phone ON public.organization_members;
CREATE TRIGGER sync_membership_student_phone
BEFORE INSERT OR UPDATE OF profile_id, role, student_phone ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.sync_membership_student_phone();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.sync_profile_student_phone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.organization_members SET student_phone = NEW.phone_normalized
  WHERE profile_id = NEW.profile_id AND role = 'STUDENT';
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS sync_profile_student_phone ON public.profiles;
CREATE TRIGGER sync_profile_student_phone AFTER UPDATE OF phone ON public.profiles
FOR EACH ROW WHEN (OLD.phone_normalized IS DISTINCT FROM NEW.phone_normalized)
EXECUTE FUNCTION public.sync_profile_student_phone();
--> statement-breakpoint
-- One call is one transaction: membership failure also rolls back the profile.
-- Caller identity comes from the authenticated session, never from JSON fields.
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
REVOKE ALL ON FUNCTION public.save_managed_student(uuid,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_managed_student(uuid,jsonb,uuid) TO authenticated;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.sync_membership_student_phone() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_profile_student_phone() FROM PUBLIC;
