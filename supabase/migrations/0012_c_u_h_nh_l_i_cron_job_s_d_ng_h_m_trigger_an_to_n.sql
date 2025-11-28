-- First, unschedule any existing job with this name to avoid conflicts
SELECT cron.unschedule('auto-run-automation-job');

-- Then, schedule the job to run every 10 minutes, calling the secure trigger function
SELECT cron.schedule(
  'auto-run-automation-job',
  '*/10 * * * *',
  $$ SELECT public.trigger_auto_run_automation(); $$
);