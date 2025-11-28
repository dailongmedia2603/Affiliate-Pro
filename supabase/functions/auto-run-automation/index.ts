// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIN_INTERVAL_MINUTES = 10;

serve(async (req) => {
  console.log(`[INFO] auto-run-automation function invoked.`);
  // 1. Check for cron secret
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[ERROR] Unauthorized: Cron secret mismatch or missing.');
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  console.log(`[INFO] Cron secret validated.`);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // 2. Get all configs with auto-run enabled directly from the database query
    console.log(`[INFO] Fetching channels with auto-run enabled...`);
    const { data: configs, error: configError } = await supabaseAdmin
      .from('automation_configs')
      .select('channel_id, user_id, config_data')
      .eq('config_data->>isAutoRunEnabled', 'true'); // Filter in the DB

    if (configError) {
        console.error(`[ERROR] Failed to fetch automation configs:`, configError.message);
        throw configError;
    }
    
    console.log(`[INFO] Found ${configs.length} total configs with isAutoRunEnabled=true.`);

    // Further filter in JS for autoRunCount > 0
    const eligibleConfigs = configs.filter(c => c.config_data?.autoRunCount > 0);

    if (eligibleConfigs.length === 0) {
      console.log(`[INFO] No eligible channels found for auto-run after filtering. Exiting.`);
      return new Response(JSON.stringify({ message: 'No eligible channels found for auto-run.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[INFO] Found ${eligibleConfigs.length} eligible channels to process.`);
    const summary = [];

    // 3. Loop through each eligible config
    for (const config of eligibleConfigs) {
      const { channel_id, user_id, config_data } = config;
      const autoRunCount = config_data.autoRunCount;
      console.log(`\n[PROCESS] Processing Channel ID: ${channel_id}`);

      try {
        // 4. Check for an active run
        console.log(`[PROCESS] Channel ${channel_id}: Checking for existing active runs...`);
        const { data: activeRun, error: activeRunError } = await supabaseAdmin
          .from('automation_runs')
          .select('id')
          .eq('channel_id', channel_id)
          .in('status', ['starting', 'running'])
          .maybeSingle();

        if (activeRunError) throw activeRunError;
        if (activeRun) {
          const message = `Channel ${channel_id}: Skipped, an automation is already running.`;
          console.log(`[SKIP] ${message}`);
          summary.push(message);
          continue;
        }
        console.log(`[PROCESS] Channel ${channel_id}: No active runs found.`);

        // 5. Check daily run count (only for 'auto' runs)
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        console.log(`[PROCESS] Channel ${channel_id}: Checking auto-runs since ${today.toISOString()}...`);
        const { count: runsToday, error: countError } = await supabaseAdmin
          .from('automation_runs')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', channel_id)
          .eq('trigger_type', 'auto')
          .gte('started_at', today.toISOString());

        if (countError) throw countError;
        console.log(`[PROCESS] Channel ${channel_id}: Found ${runsToday} auto-runs today. Limit is ${autoRunCount}.`);
        if (runsToday >= autoRunCount) {
          const message = `Channel ${channel_id}: Skipped, daily auto-run limit of ${autoRunCount} reached.`;
          console.log(`[SKIP] ${message}`);
          summary.push(message);
          continue;
        }

        // 6. Check time since last run (any type)
        console.log(`[PROCESS] Channel ${channel_id}: Checking time since last completed run...`);
        const { data: lastRun, error: lastRunError } = await supabaseAdmin
          .from('automation_runs')
          .select('finished_at')
          .eq('channel_id', channel_id)
          .not('finished_at', 'is', null)
          .order('finished_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastRunError) throw lastRunError;
        if (lastRun && lastRun.finished_at) {
          const lastRunTime = new Date(lastRun.finished_at);
          const now = new Date();
          const minutesSinceLastRun = (now.getTime() - lastRunTime.getTime()) / (1000 * 60);
          console.log(`[PROCESS] Channel ${channel_id}: Last run was ${minutesSinceLastRun.toFixed(1)} minutes ago. Minimum interval is ${MIN_INTERVAL_MINUTES}.`);

          if (minutesSinceLastRun < MIN_INTERVAL_MINUTES) {
            const message = `Channel ${channel_id}: Skipped, last run was only ${minutesSinceLastRun.toFixed(1)} minutes ago.`;
            console.log(`[SKIP] ${message}`);
            summary.push(message);
            continue;
          }
        } else {
            console.log(`[PROCESS] Channel ${channel_id}: No previous completed runs found. Proceeding.`);
        }

        // 7. All checks passed, trigger automation
        console.log(`[TRIGGER] Channel ${channel_id}: All checks passed. Invoking 'run-automation' function...`);
        const { error: invokeError } = await supabaseAdmin.functions.invoke('run-automation', {
          body: { channelId: channel_id, userId: user_id, trigger_type: 'auto' },
        });

        if (invokeError) {
          throw new Error(`Failed to invoke run-automation for channel ${channel_id}: ${invokeError.message}`);
        }
        
        const successMessage = `Channel ${channel_id}: Successfully triggered auto-run.`;
        console.log(`[SUCCESS] ${successMessage}`);
        summary.push(successMessage);

      } catch (channelError) {
        const errorMessage = `Channel ${channel_id}: Failed with error: ${channelError.message}`;
        console.error(`[ERROR] ${errorMessage}`);
        summary.push(errorMessage);
      }
    }

    console.log(`[INFO] Auto-run worker finished. Summary:`, summary);
    return new Response(JSON.stringify({ message: 'Auto-run worker finished.', summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FATAL] Fatal error in auto-run-automation function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});