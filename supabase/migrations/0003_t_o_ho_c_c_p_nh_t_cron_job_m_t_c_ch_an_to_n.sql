-- Schedule the auto-run automation job to run every 10 minutes
-- This will create the job if it doesn't exist, or update it if it does.
SELECT cron.schedule(
  'auto-run-automation-job',
  '*/10 * * * *',
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

-- Schedule the task status checker to run every minute
-- This will create the job if it doesn't exist, or update it if it does.
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