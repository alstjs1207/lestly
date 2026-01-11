-- Organization Member Check Function
-- Checks if the current user belongs to the specified organization
-- Uses organization_members junction table for N:N relationship

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE profile_id = auth.uid()
    AND organization_id = org_id
    AND state = 'NORMAL'
  );
$$;

-- Alias for backwards compatibility
CREATE OR REPLACE FUNCTION public.is_same_organization(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_org_member(target_org_id);
$$;
