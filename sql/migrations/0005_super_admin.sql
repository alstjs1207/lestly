-- Super Admin Function and RLS Policy Updates
-- This migration adds super admin support for service-level administration

-- Create is_super_admin() function
-- Checks if the current user has super_admin role in app_metadata
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

-- Grant execute permission to authenticated role
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Update organizations RLS policies to allow super admin full access
CREATE POLICY "super-admin-all-organizations-policy" ON "organizations"
FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Update organization_members RLS policies to allow super admin full access
CREATE POLICY "super-admin-all-org-members-policy" ON "organization_members"
FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Update profiles RLS policies to allow super admin full access
CREATE POLICY "super-admin-all-profiles-policy" ON "profiles"
FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Update schedules RLS policies to allow super admin full access
CREATE POLICY "super-admin-all-schedules-policy" ON "schedules"
FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Update settings RLS policies to allow super admin full access
CREATE POLICY "super-admin-all-settings-policy" ON "settings"
FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Update programs RLS policies to allow super admin full access
CREATE POLICY "super-admin-all-programs-policy" ON "programs"
FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());
