-- Phase 1: optional region and organization-scoped text classifications.
-- Codes are stable identifiers; labels are display metadata. Catalog editing is Phase 2.
CREATE TABLE public.organization_student_types (
  organization_id uuid NOT NULL REFERENCES public.organizations(organization_id) ON DELETE CASCADE,
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 80),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  PRIMARY KEY (organization_id, code)
);
ALTER TABLE public.organization_student_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_student_types FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organization_student_types TO authenticated;
GRANT ALL ON public.organization_student_types TO service_role;
CREATE POLICY "members-select-student-types" ON public.organization_student_types FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_super_admin());
--> statement-breakpoint
CREATE FUNCTION public.initialize_student_types() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.organization_student_types(organization_id,code,label)
    VALUES(NEW.organization_id,'STUDENT','학생'),(NEW.organization_id,'ADULT','성인');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.initialize_student_types() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER initialize_student_types AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.initialize_student_types();
INSERT INTO public.organization_student_types(organization_id,code,label)
  SELECT o.organization_id, t.code, t.label FROM public.organizations o
  CROSS JOIN (VALUES ('STUDENT','학생'),('ADULT','성인')) AS t(code,label);
--> statement-breakpoint
-- Preserve the old classification once, including shared profiles with multiple memberships.
UPDATE public.profiles p SET description = concat_ws(E'\n', nullif(p.description,''), '[이전 유형: 재수생]')
WHERE EXISTS (SELECT 1 FROM public.organization_members m
  WHERE m.profile_id=p.profile_id AND m.role='STUDENT' AND m.type='DROPPER')
  AND strpos(coalesce(p.description,''), '[이전 유형: 재수생]')=0;
ALTER TABLE public.organization_members ALTER COLUMN type TYPE text USING type::text;
UPDATE public.organization_members SET type='STUDENT' WHERE type IN ('EXAMINEE','DROPPER');
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_student_type_fk
  FOREIGN KEY (organization_id,type) REFERENCES public.organization_student_types(organization_id,code)
  DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
-- Omitted state preserves the locked membership state; explicit legacy changes still work.
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
    OR NOT EXISTS (SELECT 1 FROM public.organization_student_types t WHERE t.organization_id=p_organization_id AND t.code=v_type)
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
    v_end := coalesce(v_end, (v_start + interval '1 year')::date);
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
DROP TYPE public.user_type;
NOTIFY pgrst, 'reload schema';
