// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE = "https://api.beautyapp.work";

// --- Helper Functions ---
async function getHiggsfieldToken(cookie, clerk_active_context) {
  const tokenResponse = await fetch(`${API_BASE}/gettoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie, clerk_active_context }),
  });
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Lỗi khi lấy token từ Higgsfield: ${tokenResponse.status} - ${errorText}`);
  }
  const tokenData = await tokenResponse.json();
  if (!tokenData.jwt) throw new Error('Phản hồi từ Higgsfield không chứa token (jwt).');
  return tokenData.jwt;
}

async function getTaskStatus(token, taskId) {
  const response = await fetch(`${API_BASE}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, taskid: taskId })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Không thể lấy trạng thái tác vụ ${taskId}: ${errorText}`);
  }
  return response.json();
}

function replacePlaceholders(template, data) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
}

// --- Main Orchestrator Logic ---
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  try {
    console.log("--- Cron Job: Automation Orchestrator Started ---");
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch all 'running' automation steps that have an api_task_id
    const { data: runningSteps, error: stepsError } = await supabaseAdmin
      .from('automation_run_steps')
      .select(`
        *,
        run:automation_runs(channel_id, user_id),
        sub_product:sub_products(name, description)
      `)
      .eq('status', 'running')
      .not('api_task_id', 'is', null);

    if (stepsError) throw stepsError;
    if (!runningSteps || runningSteps.length === 0) {
      console.log("[INFO] No running automation steps to check. Exiting.");
      return new Response(JSON.stringify({ message: 'Không có bước nào đang chạy.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.log(`[INFO] Found ${runningSteps.length} running steps to check.`);

    const userCache = new Map();
    let tasksUpdated = 0;

    for (const step of runningSteps) {
      try {
        console.log(`[INFO] Processing step ID: ${step.id} (Type: ${step.step_type})`);
        
        // 1. Get user token (cached)
        let cachedUser = userCache.get(step.run.user_id);
        if (!cachedUser) {
          const { data: settings, error: settingsError } = await supabaseAdmin
            .from('user_settings')
            .select('higgsfield_cookie, higgsfield_clerk_context, voice_api_key')
            .eq('id', step.run.user_id)
            .single();
          if (settingsError || !settings) {
            console.warn(`[WARN] Skipping tasks for user ${step.run.user_id}: Settings not found.`);
            userCache.set(step.run.user_id, { token: null });
            continue;
          }
          const token = await getHiggsfieldToken(settings.higgsfield_cookie, settings.higgsfield_clerk_context);
          cachedUser = { token, settings };
          userCache.set(step.run.user_id, cachedUser);
        } else if (!cachedUser.token) {
          continue;
        }

        // 2. Check API task status
        const statusData = await getTaskStatus(cachedUser.token, step.api_task_id);
        const job = statusData?.jobs?.[0];
        const apiStatus = job?.status;
        console.log(`[INFO] API status for task ${step.api_task_id}: ${apiStatus}`);

        if (apiStatus && ['completed', 'failed', 'nsfw'].includes(apiStatus)) {
          const newStatus = apiStatus === 'completed' ? 'completed' : 'failed';
          const resultUrl = job?.results?.raw?.url;
          const errorMessage = job?.error;

          // 3. Update current step
          await supabaseAdmin
            .from('automation_run_steps')
            .update({ status: newStatus, output_data: { url: resultUrl }, error_message: errorMessage })
            .eq('id', step.id);
          tasksUpdated++;
          console.log(`[SUCCESS] Updated step ${step.id} to status: ${newStatus}`);

          if (newStatus === 'failed') {
            await supabaseAdmin.from('automation_runs').update({ status: 'failed' }).eq('id', step.run_id);
            console.error(`[ERROR] Run ${step.run_id} marked as failed due to failed step ${step.id}.`);
            continue; // Stop processing this chain
          }

          // 4. Trigger next step
          const { data: config, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', step.run.channel_id).single();
          if (configError || !config) {
            throw new Error(`Config not found for channel ${step.run.channel_id}`);
          }

          if (step.step_type === 'generate_image') {
            // Trigger generate_video
            const videoPrompt = replacePlaceholders(config.config_data.videoPromptTemplate, { image_prompt: step.input_data.prompt });
            const { data: videoStep, error: videoStepError } = await supabaseAdmin.from('automation_run_steps').insert({
              run_id: step.run_id,
              sub_product_id: step.sub_product_id,
              step_type: 'generate_video',
              status: 'pending',
              input_data: { prompt: videoPrompt, imageUrl: resultUrl, model: 'kling' }
            }).select('id').single();
            if (videoStepError) throw videoStepError;
            
            // Invoke function to start video generation
            supabaseAdmin.functions.invoke('higgsfield-python-proxy', {
              body: { action: 'generate_video', model: 'kling', prompt: videoPrompt, imageUrl: resultUrl, options: { duration: 5, width: 1024, height: 576, resolution: "1080p" } }
            }).catch(console.error);
            console.log(`[INFO] Triggered 'generate_video' step for run ${step.run_id}`);
          }
          // Add logic for other step transitions here (video -> voice_script, etc.)
        }
      } catch (e) {
        console.error(`[ERROR] Failed to process step ${step.id}:`, e.message);
        await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: e.message }).eq('id', step.id);
        await supabaseAdmin.from('automation_runs').update({ status: 'failed' }).eq('id', step.run_id);
      }
    }

    // Final check for completed runs
    // (This logic can be added later to mark runs as 'completed' when all steps are done)

    const summary = `--- Cron Job Finished. Checked ${runningSteps.length} steps. Updated ${tasksUpdated} steps. ---`;
    console.log(summary);
    return new Response(JSON.stringify({ message: summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[FATAL] An error occurred in the orchestrator function:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});