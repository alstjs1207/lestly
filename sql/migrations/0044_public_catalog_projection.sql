-- Add the safe public contract before changing existing table read privileges.
CREATE FUNCTION public.get_public_program_by_slug(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'program_id',p.program_id,'slug',p.slug,'title',p.title,'subtitle',p.subtitle,
    'description',p.description,'cover_image_url',p.cover_image_url,
    'location_type',p.location_type,'location_address',p.location_address,
    'duration_minutes',p.duration_minutes,'total_sessions',p.total_sessions,
    -- Public capacity is retained for the existing production introduction footer.
    'max_capacity',p.max_capacity,
    'curriculum',CASE WHEN jsonb_typeof(p.curriculum)='array' THEN
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'session',e.item->'session','title',e.item->'title','description',e.item->'description'
      ) ORDER BY e.ordinality) FROM jsonb_array_elements(p.curriculum) WITH ORDINALITY e(item,ordinality)
        WHERE jsonb_typeof(e.item)='object'),'[]'::jsonb) ELSE '[]'::jsonb END,
    'instructor',CASE WHEN i.instructor_id IS NULL THEN NULL ELSE jsonb_build_object(
      'name',i.name,'info',i.info,'photo_url',i.photo_url,'career',i.career,
      'sns',jsonb_build_object('instagram',i.sns->'instagram','youtube',i.sns->'youtube')
    ) END
  )
  FROM public.programs p LEFT JOIN public.instructors i
    ON i.instructor_id=p.instructor_id AND i.organization_id=p.organization_id
  WHERE p.slug=p_slug AND p.is_public IS TRUE AND p.status='ACTIVE';
$$;
REVOKE ALL ON FUNCTION public.get_public_program_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_program_by_slug(text) TO anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
