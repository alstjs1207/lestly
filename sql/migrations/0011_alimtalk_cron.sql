-- =============================================
-- 알림톡 Cron Job 설정 (pg_cron + pg_net)
-- 5분마다 alimtalk-cron API 호출
-- =============================================

-- pg_cron 확장 활성화 (이미 활성화되어 있으면 스킵)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- pg_net 확장 활성화 (HTTP 호출용)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 기존 cron job이 있으면 삭제
SELECT cron.unschedule('alimtalk-cron-job')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'alimtalk-cron-job'
);

-- 알림톡 Cron Job 등록 (5분마다 실행)
SELECT cron.schedule(
  'alimtalk-cron-job',           -- job 이름
  '*/5 * * * *',                 -- 5분마다
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.app_url') || '/notifications/api/alimtalk-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', current_setting('app.settings.cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 참고: app.settings.app_url과 app.settings.cron_secret은
-- Supabase Dashboard > Project Settings > Database > Connection string > Application Settings에서 설정해야 합니다.
-- 또는 아래와 같이 직접 URL을 지정할 수 있습니다:
--
-- SELECT cron.schedule(
--   'alimtalk-cron-job',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://your-app-domain.com/notifications/api/alimtalk-cron',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'your-cron-secret'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
