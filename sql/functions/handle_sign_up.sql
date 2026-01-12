/**
 * Database Trigger Function: handle_sign_up
 *
 * This function is triggered after a new user is inserted into the auth.users table.
 * It automatically creates a corresponding profile record in the public.profiles table
 * with appropriate default values based on the authentication provider used.
 *
 * The function handles different authentication scenarios:
 * 1. Email/phone authentication: Uses provided name or defaults to 'Anonymous'
 * 2. OAuth providers (Google, GitHub, etc.): Uses profile data from the provider
 * 3. Admin signup: Creates profile only (organization membership handled in app layer)
 *
 * Note: Organization membership (role, state, type) is now managed through the
 * organization_members table. This trigger only creates the base profile.
 *
 * Security considerations:
 * - Uses SECURITY DEFINER to run with the privileges of the function owner
 * - Sets an empty search path to prevent search path injection attacks
 *
 * @returns TRIGGER - Returns the NEW record that triggered the function
 */
CREATE OR REPLACE FUNCTION handle_sign_up()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET SEARCH_PATH = ''
AS $$
BEGIN
      -- admin_created인 경우 프로필 생성 스킵 (API에서 직접 생성)
      IF new.raw_app_meta_data ? 'admin_created'
         AND (new.raw_app_meta_data ->> 'admin_created') = 'true' THEN
          RETURN NEW;
      END IF;

     -- Handle admin signup (is_admin_signup flag in user metadata)
        -- Only creates profile; organization_members entry is created in app layer
        -- Set is_signup_complete = false since signup is not yet complete
        IF (new.raw_user_meta_data ->> 'is_admin_signup')::boolean = true THEN
            INSERT INTO public.profiles (profile_id, name, marketing_consent, is_signup_complete)
            VALUES (
                new.id,
                COALESCE(new.raw_user_meta_data ->> 'name', 'Admin'),
                COALESCE((new.raw_user_meta_data ->> 'marketing_consent')::boolean, FALSE),
                FALSE  -- Admin signup not complete until organization setup
            );
            RETURN NEW;
        END IF;

      -- 일반 회원가입
      IF new.raw_app_meta_data ? 'provider' THEN
          INSERT INTO public.profiles (profile_id, name, avatar_url, marketing_consent)
          VALUES (
              new.id,
              COALESCE(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', 'User'),
              new.raw_user_meta_data ->> 'avatar_url',
              TRUE
          );
      END IF;

      RETURN NEW;
  END;

/**
 * Database Trigger: handle_sign_up
 *
 * This trigger executes the handle_sign_up function automatically
 * after a new user is inserted into the auth.users table.
 *
 * The trigger runs once for each row inserted (FOR EACH ROW)
 * and only activates on INSERT operations, not on UPDATE or DELETE.
 */
CREATE TRIGGER handle_sign_up
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_sign_up();

