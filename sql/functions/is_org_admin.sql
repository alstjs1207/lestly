CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.profiles p ON p.profile_id = om.profile_id
    WHERE p.auth_user_id = auth.uid()
      AND om.organization_id = org_id
      AND om.role = 'ADMIN'
      AND om.state = 'NORMAL'
  );
$$;
