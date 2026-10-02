CREATE OR REPLACE FUNCTION public.handle_sign_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    profile_id, auth_user_id, contact_email, name, avatar_url, marketing_consent
  ) VALUES (
    NEW.id, NEW.id, NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
             NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), 'Anonymous'),
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    COALESCE(lower(NEW.raw_user_meta_data ->> 'marketing_consent') = 'true', false)
  );
  RETURN NEW;
END;
$$;
