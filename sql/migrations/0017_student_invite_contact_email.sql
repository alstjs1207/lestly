-- New callers enrich an invited student's empty contact email atomically.
-- The original claim RPC remains unchanged for older/production deployments.
CREATE OR REPLACE FUNCTION public.claim_student_invite_with_contact_email(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_kakao_email text;
BEGIN
  -- Reuse all invitation, tenant, membership and account-link checks. Any
  -- subsequent error rolls this claim back as part of the same transaction.
  v_profile_id := public.claim_student_invite(p_token_hash);

  -- identity_data is maintained by Supabase Auth after the provider response.
  -- Never copy user-editable raw_user_meta_data or a temporary profile email.
  SELECT NULLIF(btrim(i.identity_data ->> 'email'), '') INTO v_kakao_email
  FROM auth.identities i
  WHERE i.user_id = v_auth_user_id
    AND i.provider = 'kakao'
    AND i.identity_data ->> 'email_verified' = 'true'
  ORDER BY i.updated_at DESC
  LIMIT 1;

  IF v_kakao_email IS NOT NULL THEN
    UPDATE public.profiles
    SET contact_email = v_kakao_email, updated_at = now()
    WHERE profile_id = v_profile_id
      AND auth_user_id = v_auth_user_id
      AND NULLIF(btrim(contact_email), '') IS NULL;
  END IF;

  RETURN v_profile_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_student_invite_with_contact_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_student_invite_with_contact_email(text) TO authenticated;
