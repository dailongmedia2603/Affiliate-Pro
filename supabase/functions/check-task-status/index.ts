// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE = "https://api.beautyapp.work";

const logToDb = async (supabaseAdmin, runId, message, level = 'INFO', stepId = null, metadata = {}) => {
  if (!runId) return;
  try {
    await supabaseAdmin.from('automation_run_logs').insert({ run_id: runId, step_id: stepId, message, level, metadata });
  } catch (e) { console.error('Failed to write log to DB:', e.message); }
};

async function getHiggsfieldToken(cookie, clerk_active_context) {
  const tokenResponse = await fetch(`${API_BASE}/gettoken`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cookie, clerk_active_context }) });
  if (!tokenResponse.ok) throw new Error(`Lỗi khi lấy token từ Higgsfield: ${await tokenResponse.text()}`);
  const tokenData = await tokenResponse.json();
  if (!tokenData.jwt) throw new Error('Phản hồi từ Higgsfield không chứa token (jwt).');
  return tokenData.jwt;
}

async function getTaskStatus(token, taskId) {
  const response = await fetch(`${API_BASE}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, taskid: taskId }) });
  if (!response.ok) throw new Error(`Không thể lấy trạng thái tác vụ ${taskId}: ${await response.text()}`);
  return response.json();
}

function replacePlaceholders(template, data) {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    
    const { data: runningSteps, error: stepsError } = await supabaseAdmin
      .from('automation_run_steps').select(`*, run:automation_runs(id, channel_id, user_id), sub_product:sub_products(name, description)`)
      .eq('status', 'running').not('api_task_id', 'is', null);

    if (stepsError) throw stepsError;
    
    const userCache = new Map();

    if (runningSteps && runningSteps.length > 0) {
        for (const step of runningSteps) {
          const runId = step.run.id;
          const stepId = step.id;
          try {
            if (step.step_type === 'generate_voice') continue; // Voice worker handles its own polling

            let cachedUser = userCache.get(step.run.user_id);
            if (!cachedUser) {
              const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('higgsfield_cookie, higgsfield_clerk_context').eq('id', step.run.user_id).single();
              if (settingsError || !settings) {
                userCache.set(step.run.user_id, { token: null });
                continue;
              }
              const token = await getHiggsfieldToken(settings.higgsfield_cookie, settings.higgsfield_clerk_context);
              cachedUser = { token };
              userCache.set(step.run.user_id, cachedUser);
            } else if (!cachedUser.token) continue;

            const statusData = await getTaskStatus(cachedUser.token, step.api_task_id);
            const job = statusData?.jobs?.[0];
            const apiStatus = job?.status;

            if (apiStatus && ['completed', 'failed', 'nsfw'].includes(apiStatus)) {
              const newStatus = apiStatus === 'completed' ? 'completed' : 'failed';
              const resultUrl = job?.results?.raw?.url;
              const errorMessage = job?.error;

              await supabaseAdmin.from('automation_run_steps').update({ status: newStatus, output_data: { url: resultUrl }, error_message: errorMessage }).eq('id', stepId);
              await logToDb(supabaseAdmin, runId, `Bước ${stepId} (${step.step_type}) đã cập nhật trạng thái: ${newStatus}.`, newStatus === 'completed' ? 'SUCCESS' : 'ERROR', stepId);

              if (newStatus === 'failed') {
                await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
                await logToDb(supabaseAdmin, runId, `Phiên chạy bị đánh dấu là thất bại do bước ${stepId} thất bại.`, 'ERROR');
                continue;
              }

              const { data: config, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', step.run.channel_id).single();
              if (configError || !config) throw new Error(`Không tìm thấy cấu hình cho kênh ${step.run.channel_id}`);

              if (step.step_type === 'generate_image') {
                await logToDb(supabaseAdmin, runId, `Bước 'Tạo Ảnh' hoàn thành. Kích hoạt bước 'Tạo Video'.`, 'INFO', stepId);
                const videoPrompt = replacePlaceholders(config.config_data.videoPromptTemplate, { image_prompt: step.input_data.prompt });
                const { data: videoStep, error: videoStepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: runId, sub_product_id: step.sub_product_id, step_type: 'generate_video', status: 'pending', input_data: { prompt: videoPrompt, imageUrl: resultUrl, model: 'kling' } }).select('id').single();
                if (videoStepError) throw videoStepError;
                await logToDb(supabaseAdmin, runId, `Đã tạo bước 'Tạo Video'.`, 'INFO', videoStep.id);
                supabaseAdmin.functions.invoke('automation-worker-video', { body: JSON.stringify({ stepId: videoStep.id, userId: step.run.user_id, model: 'kling', prompt: videoPrompt, imageUrl: resultUrl, options: { duration: 5, width: 1024, height: 576, resolution: "1080p" } }) }).catch(console.error);
              } else if (step.step_type === 'generate_video') {
                await logToDb(supabaseAdmin, runId, `Bước 'Tạo Video' hoàn thành. Kích hoạt bước 'Tạo Voice'.`, 'INFO', stepId);
                const { data: voiceStep, error: voiceStepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: runId, sub_product_id: step.sub_product_id, step_type: 'generate_voice', status: 'pending', input_data: {} }).select('id').single();
                if (voiceStepError) throw voiceStepError;
                await logToDb(supabaseAdmin, runId, `Đã tạo bước 'Tạo Voice'.`, 'INFO', voiceStep.id);
                supabaseAdmin.functions.invoke('automation-worker-voice', { body: JSON.stringify({ stepId: voiceStep.id, userId: step.run.user_id }) }).catch(console.error);
              }
            }
          } catch (e) {
            await logToDb(supabaseAdmin, runId, `Không thể xử lý bước ${stepId}: ${e.message}`, 'ERROR', stepId);
            await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: e.message }).eq('id', stepId);
            await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
          }
        }
    }

    const { data: activeRuns, error: activeRunsError } = await supabaseAdmin.from('automation_runs').select('id').in('status', ['running', 'starting']);
    if (activeRunsError) throw activeRunsError;

    for (const run of activeRuns) {
        const { data: allSteps, error: allStepsError } = await supabaseAdmin.from('automation_run_steps').select('status').eq('run_id', run.id);
        if (allStepsError) continue;

        const { data: subProductCount } = await supabaseAdmin.rpc('count_sub_products_for_run', { p_run_id: run.id });
        const expectedStepCount = subProductCount * 3; // image, video, voice

        if (allSteps.length >= expectedStepCount) {
            const isFinished = allSteps.every(s => ['completed', 'failed', 'cancelled', 'stopped'].includes(s.status));
            if (isFinished) {
                const hasFailedStep = allSteps.some(s => s.status === 'failed');
                const finalStatus = hasFailedStep ? 'failed' : 'completed';
                await supabaseAdmin.from('automation_runs').update({ status: finalStatus, finished_at: new Date().toISOString() }).eq('id', run.id);
                await logToDb(supabaseAdmin, run.id, `Tất cả các bước đã hoàn thành. Trạng thái cuối cùng của phiên chạy: ${finalStatus}.`, 'SUCCESS');
            }
        }
    }

    return new Response(JSON.stringify({ message: 'Kiểm tra hoàn tất.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[FATAL] Lỗi trong check-task-status:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});