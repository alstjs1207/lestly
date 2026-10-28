-- A stale editor snapshot is a business conflict, not a retryable serialization failure.
-- PT409 returns immediately through PostgREST rather than retrying indefinitely.
CREATE OR REPLACE FUNCTION public.save_student_types(p_org uuid,p_types jsonb,p_expected_types jsonb) RETURNS void
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
    RAISE EXCEPTION 'student_types_conflict' USING ERRCODE='PT409'; END IF;
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
NOTIFY pgrst, 'reload schema';
