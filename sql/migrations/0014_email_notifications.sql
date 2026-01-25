-- =============================================
-- Email Notifications Migration
-- Adds email sending capability to the notification system
-- =============================================

-- =============================================
-- STEP 1: Create email_status Enum
-- =============================================

CREATE TYPE email_status AS ENUM (
  'PENDING',    -- Waiting for send
  'SENT',       -- Successfully sent
  'FAILED',     -- Failed to send
  'SKIPPED'     -- Skipped (no email address or disabled)
);

-- =============================================
-- STEP 2: Add columns to organization_templates
-- =============================================

ALTER TABLE organization_templates
  ADD COLUMN alimtalk_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN email_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- =============================================
-- STEP 3: Add columns to notifications
-- =============================================

ALTER TABLE notifications
  ADD COLUMN recipient_email TEXT,
  ADD COLUMN email_status email_status,
  ADD COLUMN email_sent_at TIMESTAMPTZ,
  ADD COLUMN email_error_message TEXT;

-- =============================================
-- STEP 4: Create index for email processing
-- =============================================

CREATE INDEX idx_notifications_email_pending
  ON notifications(email_status, scheduled_send_at)
  WHERE type = 'ALIMTALK' AND email_status = 'PENDING';

-- =============================================
-- STEP 5: Email Cron Job 등록
-- =============================================

-- 기존 email cron job이 있으면 삭제
SELECT cron.unschedule('email-cron-job')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'email-cron-job'
);

-- 이메일 Cron Job 등록 (5분마다 실행)
SELECT cron.schedule(
  'email-cron-job',              -- job 이름
  '*/5 * * * *',                 -- 5분마다
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.app_url') || '/api/cron/email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
