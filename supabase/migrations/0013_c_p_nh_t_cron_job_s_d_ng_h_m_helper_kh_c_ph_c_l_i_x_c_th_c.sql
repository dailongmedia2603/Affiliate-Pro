-- This migration fixes the 'auto-run-automation-job' cron job.
-- The current definition calls net.http_post directly without the required Authorization header, causing an 'Unauthorized' error.
-- This update changes the job to call the `public.trigger_auto_run_automation()` wrapper function,
-- which correctly handles fetching the CRON_SECRET from the vault, setting the header, and calling the edge function.

-- First, unschedule the existing job to avoid conflicts.
SELECT cron.unschedule('auto-run-automation-job');

-- Now, schedule the job again with the correct command that uses the secure wrapper function.
SELECT cron.schedule(
  'auto-run-automation-job',
  '* * * * *', -- Run every minute
  $$SELECT public.trigger_auto_run_automation();$$
);