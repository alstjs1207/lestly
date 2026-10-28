-- Phase 2: per-organization editable classification metadata. No booking data changes.
ALTER TABLE public.organization_student_types
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 49),
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN is_default boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT student_type_default_active CHECK (NOT is_default OR is_active);
UPDATE public.organization_student_types
  SET sort_order=CASE code WHEN 'STUDENT' THEN 0 ELSE 1 END, is_default=(code='STUDENT');
CREATE INDEX organization_student_types_order_idx ON public.organization_student_types(organization_id,sort_order,code);
--> statement-breakpoint
CREATE FUNCTION public.assert_student_type_policy(p_org uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; active_n integer; default_n integer; names_n integer; orders_n integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.organizations WHERE organization_id=p_org) THEN RETURN; END IF;
  SELECT count(*),count(*) FILTER(WHERE is_active),count(*) FILTER(WHERE is_default AND is_active),
    count(DISTINCT lower(btrim(label))),count(DISTINCT sort_order)
    INTO n,active_n,default_n,names_n,orders_n
    FROM public.organization_student_types WHERE organization_id=p_org;
  IF n NOT BETWEEN 1 AND 50 OR active_n<1 OR default_n<>1 OR names_n<>n OR orders_n<>n
    OR EXISTS(SELECT 1 FROM public.organization_student_types WHERE organization_id=p_org AND sort_order>=n) THEN
    RAISE EXCEPTION 'invalid_student_types' USING ERRCODE='22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_student_type_policy(uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.guard_student_type_catalog() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid := CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
BEGIN
  PERFORM 1 FROM public.organizations WHERE organization_id=v_org FOR UPDATE;
  IF TG_OP='DELETE' THEN
    IF FOUND THEN RAISE EXCEPTION 'student_types_cannot_remove' USING ERRCODE='22023'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
    RAISE EXCEPTION 'student_types_cannot_rekey' USING ERRCODE='22023';
  END IF;
  IF NEW.code !~ '^[A-Za-z0-9_-]{1,80}$' OR NEW.code IN ('EXAMINEE','DROPPER') THEN
    RAISE EXCEPTION 'invalid_student_types' USING ERRCODE='22023';
  END IF;
  NEW.label := btrim(NEW.label);
  RETURN NEW;
END $$;
CREATE TRIGGER guard_student_type_catalog BEFORE INSERT OR UPDATE OR DELETE ON public.organization_student_types
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_type_catalog();
REVOKE ALL ON FUNCTION public.guard_student_type_catalog() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.check_student_type_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.assert_student_type_policy(CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END);
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER student_types_policy_valid AFTER INSERT OR UPDATE OR DELETE ON public.organization_student_types
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_student_type_policy();
REVOKE ALL ON FUNCTION public.check_student_type_policy() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.initialize_student_types() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.organization_student_types(organization_id,code,label,sort_order,is_active,is_default)
    VALUES(NEW.organization_id,'STUDENT','학생',0,true,true),(NEW.organization_id,'ADULT','성인',1,true,false);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.student_types_snapshot(p_org uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'label',label,'sort_order',sort_order,
    'is_active',is_active,'is_default',is_default) ORDER BY code),'[]'::jsonb)
  FROM public.organization_student_types WHERE organization_id=p_org;
$$;
REVOKE ALL ON FUNCTION public.student_types_snapshot(uuid) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION public.save_student_types(p_org uuid,p_types jsonb,p_expected_types jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; v_expected jsonb; n integer;
BEGIN
  IF NOT public.is_org_admin(p_org) THEN RAISE EXCEPTION 'student_types_access_denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.organizations WHERE organization_id=p_org FOR UPDATE;
  IF jsonb_typeof(p_types) IS DISTINCT FROM 'array' OR jsonb_typeof(p_expected_types) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_student_types' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_types) NOT BETWEEN 1 AND 50 OR jsonb_array_length(p_expected_types) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid_student_types' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_types || p_expected_types) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(item->'code') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'label') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'is_active') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(item->'is_default') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(item->'sort_order') IS DISTINCT FROM 'number'
      OR (item->>'sort_order') !~ '^[0-9]{1,2}$'
      OR (item->>'code') !~ '^[A-Za-z0-9_-]{1,80}$'
      OR item->>'code' IN ('EXAMINEE','DROPPER')
      OR length(btrim(item->>'label')) NOT BETWEEN 1 AND 80 THEN
      RAISE EXCEPTION 'invalid_student_types' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('code',code,'label',label,'sort_order',sort_order,
    'is_active',is_active,'is_default',is_default) ORDER BY code) INTO v_expected
    FROM jsonb_to_recordset(p_expected_types) AS x(code text,label text,sort_order integer,is_active boolean,is_default boolean);
  IF v_expected IS DISTINCT FROM public.student_types_snapshot(p_org) THEN
    RAISE EXCEPTION 'student_types_conflict' USING ERRCODE='40001'; END IF;
  n := jsonb_array_length(p_types);
  IF (SELECT count(DISTINCT code)<>n OR count(DISTINCT lower(btrim(label)))<>n
      OR count(DISTINCT sort_order)<>n OR min(sort_order)<>0 OR max(sort_order)<>n-1
      OR count(*) FILTER(WHERE is_active)<1 OR count(*) FILTER(WHERE is_default)<>1
      OR count(*) FILTER(WHERE is_default AND NOT is_active)>0
    FROM jsonb_to_recordset(p_types) AS x(code text,label text,sort_order integer,is_active boolean,is_default boolean)) THEN
    RAISE EXCEPTION 'invalid_student_types' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.organization_student_types t WHERE t.organization_id=p_org
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_types) x WHERE x->>'code'=t.code)) THEN
    RAISE EXCEPTION 'student_types_cannot_remove' USING ERRCODE='22023'; END IF;
  SET CONSTRAINTS public.student_types_policy_valid DEFERRED;
  INSERT INTO public.organization_student_types(organization_id,code,label,sort_order,is_active,is_default)
    SELECT p_org,code,btrim(label),sort_order,is_active,is_default
    FROM jsonb_to_recordset(p_types) AS x(code text,label text,sort_order integer,is_active boolean,is_default boolean)
    ON CONFLICT(organization_id,code) DO UPDATE SET label=EXCLUDED.label,sort_order=EXCLUDED.sort_order,
      is_active=EXCLUDED.is_active,is_default=EXCLUDED.is_default;
  PERFORM public.assert_student_type_policy(p_org);
END $$;
REVOKE ALL ON FUNCTION public.save_student_types(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_student_types(uuid,jsonb,jsonb) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.guard_student_type_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.organization_id=OLD.organization_id AND NEW.role=OLD.role AND NEW.type IS NOT DISTINCT FROM OLD.type THEN RETURN NEW; END IF;
  IF NEW.role='STUDENT' AND NEW.type IS NOT NULL THEN
    PERFORM 1 FROM public.organizations WHERE organization_id=NEW.organization_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM public.organization_student_types t WHERE t.organization_id=NEW.organization_id AND t.code=NEW.type AND t.is_active) THEN
      RAISE EXCEPTION 'student_type_not_active' USING ERRCODE='22023'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.role='STUDENT' AND NEW.type IS NULL AND OLD.type IS NOT NULL THEN
    RAISE EXCEPTION 'student_type_required' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_student_type_assignment BEFORE INSERT OR UPDATE OF organization_id,role,type ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_type_assignment();
REVOKE ALL ON FUNCTION public.guard_student_type_assignment() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
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
    OR NOT EXISTS (SELECT 1 FROM public.organization_student_types t WHERE t.organization_id=p_organization_id AND t.code=v_type
      AND (t.is_active OR EXISTS (SELECT 1 FROM public.organization_members m
        WHERE m.organization_id=p_organization_id AND m.profile_id=p_student_id AND m.role='STUDENT' AND m.type=v_type)))
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


NOTIFY pgrst, 'reload schema';
