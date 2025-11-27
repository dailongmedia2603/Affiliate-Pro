-- First, unschedule the existing job to ensure a clean state
SELECT cron.unschedule('auto-run-automation-job');

-- Then, schedule it again to run every 10 minutes
-- This job calls a function that triggers the 'auto-run-automation' Edge Function
SELECT cron.schedule(
  'auto-run-automation-job',
  '*/10 * * * *',
  $$ SELECT public.trigger_auto_run_automation(); $$
);