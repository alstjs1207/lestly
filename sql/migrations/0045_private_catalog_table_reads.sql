-- Deploy all public page readers on 0044's safe RPC before applying this migration.
-- Keep authenticated organization-specific RLS and management/write grants intact.
REVOKE SELECT ON public.programs,public.instructors FROM PUBLIC,anon;
DO $$
DECLARE v_table text; v_columns text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['programs','instructors'] LOOP
    SELECT string_agg(quote_ident(attname),', ' ORDER BY attnum) INTO v_columns
      FROM pg_attribute WHERE attrelid=format('public.%I',v_table)::regclass
        AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE SELECT (%s) ON public.%I FROM PUBLIC,anon',v_columns,v_table);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "public-programs-select-policy" ON public.programs;
DROP POLICY IF EXISTS "public-program-instructor-policy" ON public.instructors;
DROP POLICY IF EXISTS "public-program-instructor-select-policy" ON public.instructors;
NOTIFY pgrst, 'reload schema';
