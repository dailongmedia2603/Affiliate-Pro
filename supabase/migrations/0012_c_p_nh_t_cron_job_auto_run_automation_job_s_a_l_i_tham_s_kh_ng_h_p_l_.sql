-- This migration fixes the 'auto-run-automation-job' cron job.
-- The previous definition was calling net.http_post with incorrect parameters,
-- causing the job to fail with an 'undefined column' error.
-- This update changes the job to call the `public.trigger_auto_run_automation()` wrapper function,
-- which correctly handles fetching secrets, setting headers, and calling the edge function.

-- First, we unschedule the existing job to be safe.
-- The 'if exists' logic is handled by cron.unschedule itself, it won't error if the job doesn't exist.
SELECT cron.unschedule('auto-run-automation-job');

-- Now, schedule the job again with the correct command.
-- The command now calls our wrapper function.
SELECT cron.schedule(
  'auto-run-automation-job',
  '* * * * *', -- Run every minute
  $$SELECT public.trigger_auto_run_automation();$$
);