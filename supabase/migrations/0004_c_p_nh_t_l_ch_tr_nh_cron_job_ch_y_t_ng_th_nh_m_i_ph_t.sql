-- Schedule the auto-run automation job to run every minute
-- This will update the existing job's schedule.
SELECT cron.schedule(
  'auto-run-automation-job',
  '* * * * *', -- Changed from '*/10 * * * *' to run every minute
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

-- Re-affirm the task status checker to run every minute (no change)
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