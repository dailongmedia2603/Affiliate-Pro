-- Enable the Supabase Vault extension to store secrets securely
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Re-schedule the auto-run automation job to run every minute
-- This will create or update the job.
SELECT cron.schedule(
  'auto-run-automation-job',
  '* * * * *',
  $$
    SELECT net.http_post(
      url:='https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/auto-run-automation',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_vault.get_secret('CRON_SECRET')
      ),
      body:='{}'::jsonb
    )
  $$
);

-- Re-schedule the task status checker to run every minute
-- This will create or update the job.
SELECT cron.schedule(
  'check-task-status-job',
  '* * * * *',
  $$
    SELECT net.http_post(
      url:='https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/check-task-status',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_vault.get_secret('CRON_SECRET')
      ),
      body:='{}'::jsonb
    )
  $$
);