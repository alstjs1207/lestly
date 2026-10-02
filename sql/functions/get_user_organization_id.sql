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

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.get_user_organizations() AS membership(organization_id) LIMIT 1;
$$;
