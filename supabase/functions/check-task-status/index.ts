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
    await logToDb(supabaseAdmin, null, 'Cron Job: Bắt đầu kiểm tra trạng thái tác vụ.');

    const { data: runningSteps, error: stepsError } = await supabaseAdmin
      .from('automation_run_steps').select(`*, run:automation_runs(id, channel_id, user_id), sub_product:sub_products(name, description)`)
      .eq('status', 'running').not('api_task_id', 'is', null);

    if (stepsError) throw stepsError;
    if (!runningSteps || runningSteps.length === 0) {
      await logToDb(supabaseAdmin, null, 'Không có bước nào đang chạy để kiểm tra. Kết thúc.');
      return new Response(JSON.stringify({ message: 'Không có bước nào đang chạy.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    await logToDb(supabaseAdmin, null, `Tìm thấy ${runningSteps.length} bước đang chạy để kiểm tra.`);

    const userCache = new Map();

    for (const step of runningSteps) {
      const runId = step.run.id;
      const stepId = step.id;
      try {
        await logToDb(supabaseAdmin, runId, `Kiểm tra trạng thái cho bước ${stepId} (Loại: ${step.step_type})`, 'INFO', stepId);
        
        let cachedUser = userCache.get(step.run.user_id);
        if (!cachedUser) {
          const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('higgsfield_cookie, higgsfield_clerk_context, voice_api_key').eq('id', step.run.user_id).single();
          if (settingsError || !settings) {
            await logToDb(supabaseAdmin, runId, `Bỏ qua tác vụ cho người dùng ${step.run.user_id}: Không tìm thấy cài đặt.`, 'WARN', stepId);
            userCache.set(step.run.user_id, { token: null });
            continue;
          }
          const token = await getHiggsfieldToken(settings.higgsfield_cookie, settings.higgsfield_clerk_context);
          cachedUser = { token, settings };
          userCache.set(step.run.user_id, cachedUser);
        } else if (!cachedUser.token) continue;

        const statusData = await getTaskStatus(cachedUser.token, step.api_task_id);
        const job = statusData?.jobs?.[0];
        const apiStatus = job?.status;
        await logToDb(supabaseAdmin, runId, `Trạng thái từ API cho tác vụ ${step.api_task_id}: ${apiStatus}`, 'INFO', stepId);

        if (apiStatus && ['completed', 'failed', 'nsfw'].includes(apiStatus)) {
          const newStatus = apiStatus === 'completed' ? 'completed' : 'failed';
          const resultUrl = job?.results?.raw?.url;
          const errorMessage = job?.error;

          await supabaseAdmin.from('automation_run_steps').update({ status: newStatus, output_data: { url: resultUrl }, error_message: errorMessage }).eq('id', stepId);
          await logToDb(supabaseAdmin, runId, `Bước ${stepId} đã cập nhật trạng thái: ${newStatus}.`, newStatus === 'completed' ? 'SUCCESS' : 'ERROR', stepId);

          if (newStatus === 'failed') {
            await supabaseAdmin.from('automation_runs').update({ status: 'failed' }).eq('id', runId);
            await logToDb(supabaseAdmin, runId, `Phiên chạy bị đánh dấu là thất bại do bước ${stepId} thất bại.`, 'ERROR');
            continue;
          }

          const { data: config, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', step.run.channel_id).single();
          if (configError || !config) throw new Error(`Không tìm thấy cấu hình cho kênh ${step.run.channel_id}`);

          if (step.step_type === 'generate_image') {
            await logToDb(supabaseAdmin, runId, `Bước 'Tạo Ảnh' hoàn thành. Kích hoạt bước tiếp theo: 'Tạo Video'.`, 'INFO', stepId);
            const videoPrompt = replacePlaceholders(config.config_data.videoPromptTemplate, { image_prompt: step.input_data.prompt });
            
            const { data: videoStep, error: videoStepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: runId, sub_product_id: step.sub_product_id, step_type: 'generate_video', status: 'pending', input_data: { prompt: videoPrompt, imageUrl: resultUrl, model: 'kling' } }).select('id').single();
            if (videoStepError) throw videoStepError;
            
            await logToDb(supabaseAdmin, runId, `Đã tạo bước 'Tạo Video'.`, 'INFO', videoStep.id);
            
            const userId = step.run.user_id;
            supabaseAdmin.functions.invoke('higgsfield-python-proxy', 
              { 
                body: JSON.stringify({ 
                  action: 'generate_video', 
                  stepId: videoStep.id, 
                  userId: userId,
                  model: 'kling', 
                  prompt: videoPrompt, 
                  imageUrl: resultUrl, 
                  options: { duration: 5, width: 1024, height: 576, resolution: "1080p" } 
                })
              },
              {
                  headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cronSecret}` 
                  }
              }
            ).catch(console.error);
            await logToDb(supabaseAdmin, runId, `Đã gọi function cho bước 'Tạo Video'.`, 'INFO', videoStep.id);
          }
        }
      } catch (e) {
        await logToDb(supabaseAdmin, runId, `Không thể xử lý bước ${stepId}: ${e.message}`, 'ERROR', stepId);
        await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: e.message }).eq('id', stepId);
        await supabaseAdmin.from('automation_runs').update({ status: 'failed' }).eq('id', runId);
      }
    }

    const summary = `Cron Job Hoàn thành. Đã kiểm tra ${runningSteps.length} bước.`;
    await logToDb(supabaseAdmin, null, summary);
    return new Response(JSON.stringify({ message: summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[FATAL] An error occurred in the orchestrator function:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});