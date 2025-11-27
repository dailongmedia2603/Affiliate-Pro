// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIN_INTERVAL_MINUTES = 10;

serve(async (req) => {
  // 1. Check for cron secret
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // 2. Get all configs with auto-run enabled
    const { data: configs, error: configError } = await supabaseAdmin
      .from('automation_configs')
      .select('channel_id, user_id, config_data');

    if (configError) throw configError;

    const eligibleConfigs = configs.filter(c => 
        c.config_data?.isAutoRunEnabled === true && 
        c.config_data?.autoRunCount > 0
    );

    if (eligibleConfigs.length === 0) {
      return new Response(JSON.stringify({ message: 'No channels configured for auto-run.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const summary = [];

    // 3. Loop through each eligible config
    for (const config of eligibleConfigs) {
      const { channel_id, user_id, config_data } = config;
      const autoRunCount = config_data.autoRunCount;

      try {
        // 4. Check for an active run
        const { data: activeRun, error: activeRunError } = await supabaseAdmin
          .from('automation_runs')
          .select('id')
          .eq('channel_id', channel_id)
          .in('status', ['starting', 'running'])
          .maybeSingle();

        if (activeRunError) throw activeRunError;
        if (activeRun) {
          summary.push(`Channel ${channel_id}: Skipped, an automation is already running.`);
          continue;
        }

        // 5. Check daily run count (only for 'auto' runs)
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const { count: runsToday, error: countError } = await supabaseAdmin
          .from('automation_runs')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', channel_id)
          .eq('trigger_type', 'auto')
          .gte('started_at', today.toISOString());

        if (countError) throw countError;
        if (runsToday >= autoRunCount) {
          summary.push(`Channel ${channel_id}: Skipped, daily auto-run limit of ${autoRunCount} reached.`);
          continue;
        }

        // 6. Check time since last run (any type)
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

          if (minutesSinceLastRun < MIN_INTERVAL_MINUTES) {
            summary.push(`Channel ${channel_id}: Skipped, last run was only ${minutesSinceLastRun.toFixed(1)} minutes ago.`);
            continue;
          }
        }

        // 7. All checks passed, trigger automation
        console.log(`Triggering auto-run for channel ${channel_id}`);
        const { error: invokeError } = await supabaseAdmin.functions.invoke('run-automation', {
          body: { channelId: channel_id, userId: user_id, trigger_type: 'auto' },
        });

        if (invokeError) {
          throw new Error(`Failed to invoke run-automation for channel ${channel_id}: ${invokeError.message}`);
        }
        
        summary.push(`Channel ${channel_id}: Successfully triggered auto-run.`);

      } catch (channelError) {
        summary.push(`Channel ${channel_id}: Failed with error: ${channelError.message}`);
        console.error(`Error processing channel ${channel_id}:`, channelError.message);
      }
    }

    return new Response(JSON.stringify({ message: 'Auto-run worker finished.', summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Fatal error in auto-run-automation function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});