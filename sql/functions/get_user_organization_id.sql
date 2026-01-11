-- Get User Organizations Function
-- Returns all organization IDs that the current user belongs to
-- Uses organization_members junction table for N:N relationship

CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.organization_members
  WHERE profile_id = auth.uid()
  AND state = 'NORMAL';
$$;

-- Get first organization ID (for backwards compatibility)
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organization_id FROM public.organization_members
  WHERE profile_id = auth.uid()
  AND state = 'NORMAL'
  LIMIT 1;
$$;
