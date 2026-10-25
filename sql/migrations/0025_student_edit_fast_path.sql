-- Keep ordinary profile edits outside booking locks and cancellation checks.
CREATE OR REPLACE FUNCTION public.save_managed_student(p_organization_id uuid, p_values jsonb, p_student_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_current record;
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
    SELECT m.state, m.type, p.class_start_date, p.class_end_date INTO v_current
    FROM public.organization_members m JOIN public.profiles p USING (profile_id)
    WHERE m.organization_id=p_organization_id AND m.profile_id=p_student_id AND m.role='STUDENT';
    IF NOT FOUND THEN RAISE EXCEPTION 'student_not_found' USING ERRCODE = 'P0002'; END IF;

    -- Basic edits do not participate in booking serialization. Do not write lifecycle
    -- fields here: a concurrent graduation or course change must remain intact.
    IF v_current.state IS NOT DISTINCT FROM v_state AND v_current.type IS NOT DISTINCT FROM v_type
      AND v_current.class_start_date IS NOT DISTINCT FROM v_start
      AND v_current.class_end_date IS NOT DISTINCT FROM v_end THEN
      UPDATE public.profiles SET
        name = btrim(p_values->>'name'), phone = v_phone, region = btrim(p_values->>'region'),
        contact_email = nullif(btrim(p_values->>'email'), ''),
        birth_date = nullif(p_values->>'birth_date', '')::date,
        parent_name = nullif(btrim(p_values->>'parent_name'), ''),
        parent_phone = nullif(btrim(p_values->>'parent_phone'), ''),
        description = nullif(btrim(p_values->>'description'), ''),
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
