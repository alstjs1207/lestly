-- Optional signup trigger. Enqueue only the template fields; never copy the
-- auth.users row (password hashes, reset tokens and authentication metadata).
CREATE OR REPLACE FUNCTION public.welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    PERFORM pgmq.send(
      queue_name => 'mailer'::text,
      msg => jsonb_build_object(
        'template', 'welcome',
        'to', NEW.email,
        'data', jsonb_build_object(
          'name', COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
                           NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), '회원')
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
