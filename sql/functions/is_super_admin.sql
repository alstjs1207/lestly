-- Super Admin Check Function
-- Checks if the current user is a super admin (service-level administrator)
-- Uses app_metadata.role from JWT token for identification
-- Super admin can access all organizations and data

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin',
    false
  );
$$;
