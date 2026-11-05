-- Consultation push is attempted only in the submitting server request.
-- Preserve the existing reservation retry job and all historical notification rows.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'consult-push-retry-job';
