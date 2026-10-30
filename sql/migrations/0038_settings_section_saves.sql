-- Partial settings saves merge the latest policy under the existing booking lock.
-- No existing rows, reservations, classes, policies or functions are rewritten.
CREATE FUNCTION public.save_booking_settings_section(p_org uuid,p_section text,p_values jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_policy jsonb; v_keys text[];
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_org_admin(p_org) OR public.is_super_admin()) THEN
  RAISE EXCEPTION 'settings_not_authorized' USING ERRCODE='42501';
 END IF;
 IF p_section IS NULL OR p_section NOT IN ('class_defaults','booking_times','booking_window','booking_days','cancellation_policy')
   OR jsonb_typeof(p_values) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'invalid_settings_section' USING ERRCODE='22023';
 END IF;
 v_keys:=CASE p_section
  WHEN 'class_defaults' THEN ARRAY['durationMinutes','defaultDurationMinutes','maxCapacity']
  WHEN 'booking_times' THEN ARRAY['firstStart','lastStart','startIntervalMinutes','leadMinutes','disabledStartTimes']
  WHEN 'booking_days' THEN ARRAY['disabledWeekdays'] ELSE NULL END;
 IF v_keys IS NOT NULL AND (NOT p_values ?& v_keys OR p_values-v_keys<>'{}'::jsonb) THEN
  RAISE EXCEPTION 'invalid_settings_section' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('schedule-org:'||p_org::text,0));
 IF p_section IN ('class_defaults','booking_times') THEN
  v_policy:=public.read_booking_policy(p_org) || CASE p_section
    WHEN 'class_defaults' THEN p_values-'maxCapacity' ELSE p_values-'disabledStartTimes' END;
  PERFORM public.validate_booking_policy(v_policy);
  INSERT INTO public.settings(organization_id,setting_key,setting_value)
    VALUES(p_org,'booking_policy',v_policy)
    ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value;
  IF p_section='class_defaults' THEN
   INSERT INTO public.settings(organization_id,setting_key,setting_value)
    VALUES(p_org,'max_concurrent_students',jsonb_build_object('value',p_values->'maxCapacity'))
    ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value;
  ELSE
   INSERT INTO public.settings(organization_id,setting_key,setting_value)
    VALUES(p_org,'disabled_booking_start_times',jsonb_build_object('value',p_values->'disabledStartTimes'))
    ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value;
  END IF;
 ELSIF p_section='booking_window' THEN
  PERFORM public.validate_booking_window(p_values);
  INSERT INTO public.settings(organization_id,setting_key,setting_value) VALUES(p_org,'booking_window',p_values)
   ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value;
 ELSIF p_section='cancellation_policy' THEN
  PERFORM public.validate_cancellation_policy(p_values);
  INSERT INTO public.settings(organization_id,setting_key,setting_value) VALUES(p_org,'cancellation_policy',p_values)
   ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value;
 ELSE
  INSERT INTO public.settings(organization_id,setting_key,setting_value)
   VALUES(p_org,'disabled_booking_weekdays',jsonb_build_object('value',p_values->'disabledWeekdays'))
   ON CONFLICT(organization_id,setting_key) DO UPDATE SET setting_value=excluded.setting_value;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_booking_settings_section(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_booking_settings_section(uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
