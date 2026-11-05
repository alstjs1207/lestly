-- This migration changes permissions/relationships only; it deletes no existing rows.
-- Keep request tombstones until their original expiry to prevent deleted requests replaying.
ALTER TABLE public.consult_submission_keys ALTER COLUMN notification_id DROP NOT NULL;
ALTER TABLE public.consult_submission_keys DROP CONSTRAINT consult_submission_keys_notification_id_fkey;
ALTER TABLE public.consult_submission_keys ADD CONSTRAINT consult_submission_keys_notification_id_fkey
  FOREIGN KEY(notification_id) REFERENCES public.notifications(notification_id) ON DELETE SET NULL;
GRANT DELETE ON public.notifications TO authenticated;
CREATE POLICY org_admin_delete_consult_notifications ON public.notifications
  FOR DELETE TO authenticated USING (
    public.is_org_admin(organization_id) AND type='CONSULT_REQUEST'
  );
NOTIFY pgrst, 'reload schema';
