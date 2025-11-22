// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const IMAGE_CONCURRENCY = 4;
const VIDEO_CONCURRENCY = 3;
const API_BASE = "https://api.beautyapp.work";

// --- Helper Functions ---

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

// --- Main Handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const userCache = new Map();

  try {
    // --- 1. UPDATE RUNNING TASKS ---
    const { data: runningSteps, error: stepsError } = await supabaseAdmin
      .from('automation_run_steps')
      .select(`*, run:automation_runs(id, channel_id, user_id)`)
      .eq('status', 'running')
      .not('api_task_id', 'is', null);

    if (stepsError) throw stepsError;
    
    if (runningSteps) {
      for (const step of runningSteps) {
        const runId = step.run.id;
        const stepId = step.id;
        try {
          if (step.step_type === 'generate_voice') continue; // Skip voice for now

          let cachedUser = userCache.get(step.run.user_id);
          if (!cachedUser) {
            const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('*').eq('id', step.run.user_id).single();
            if (settingsError || !settings) { userCache.set(step.run.user_id, { token: null, settings: null }); continue; }
            const token = await getHiggsfieldToken(settings.higgsfield_cookie, settings.higgsfield_clerk_context);
            cachedUser = { token, settings };
            userCache.set(step.run.user_id, cachedUser);
          } else if (!cachedUser.token || !cachedUser.settings) continue;

          const statusData = await getTaskStatus(cachedUser.token, step.api_task_id);
          const job = statusData?.jobs?.[0];
          const apiStatus = job?.status;

          if (apiStatus && ['completed', 'failed', 'nsfw'].includes(apiStatus)) {
            const newStatus = apiStatus === 'completed' ? 'completed' : 'failed';
            const resultUrl = job?.results?.raw?.url;
            const errorMessage = job?.error || (apiStatus === 'nsfw' ? 'Nội dung không phù hợp (NSFW).' : `Tác vụ thất bại không có thông báo lỗi cụ thể.`);

            if (newStatus === 'failed') {
              await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: errorMessage }).eq('id', stepId);
              await logToDb(supabaseAdmin, runId, `Bước ${step.step_type} đã thất bại. Dừng phiên chạy. Lỗi: ${errorMessage}`, 'ERROR', stepId);
              await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
              continue;
            }

            // If completed
            await supabaseAdmin.from('automation_run_steps').update({ status: 'completed', output_data: { url: resultUrl }, error_message: null }).eq('id', stepId);
            await logToDb(supabaseAdmin, runId, `Bước ${step.step_type} đã hoàn thành.`, 'SUCCESS', stepId);

            if (step.step_type === 'generate_image') {
              const { data: config, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', step.run.channel_id).single();
              if (configError || !config) throw new Error(`Không tìm thấy cấu hình cho kênh ${step.run.channel_id}`);
              
              const { data: subProduct, error: subProductError } = await supabaseAdmin.from('sub_products').select('name, description').eq('id', step.sub_product_id).single();
              if (subProductError) throw subProductError;

              const geminiVideoPrompt = replacePlaceholders(config.config_data.videoPromptGenerationTemplate, { image_prompt: step.input_data.prompt, product_name: subProduct.name, product_description: subProduct.description });
              const { data: geminiResponse, error: geminiError } = await supabaseAdmin.functions.invoke('proxy-gemini-api', { body: { apiUrl: cachedUser.settings.gemini_api_url, prompt: geminiVideoPrompt, token: cachedUser.settings.gemini_api_key } });
              if (geminiError || !geminiResponse.success) throw new Error(`Lỗi tạo prompt video từ AI: ${geminiError?.message || geminiResponse?.error}`);
              
              const finalVideoPrompt = geminiResponse.answer;
              if (!finalVideoPrompt) throw new Error("AI không trả về prompt video.");

              const videoInputData = { prompt: finalVideoPrompt, imageUrl: resultUrl, source_image_step_id: step.id, gemini_prompt_for_video: geminiVideoPrompt };
              const { error: videoStepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: runId, sub_product_id: step.sub_product_id, step_type: 'generate_video', status: 'pending', input_data: videoInputData });
              if (videoStepError) throw videoStepError;
              await logToDb(supabaseAdmin, runId, `Đã xếp hàng bước tạo video.`, 'INFO');

            } else if (step.step_type === 'generate_video') {
              const { count: remainingSteps } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('run_id', runId).in('status', ['pending', 'running']);
              if (remainingSteps === 0) {
                await logToDb(supabaseAdmin, runId, 'Tất cả các bước đã hoàn thành. Kết thúc phiên chạy.', 'SUCCESS');
                await supabaseAdmin.from('automation_runs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', runId);
              }
            }
          }
        } catch (e) {
          await logToDb(supabaseAdmin, runId, `Lỗi khi xử lý bước ${stepId}: ${e.message}`, 'ERROR', stepId);
          await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: e.message }).eq('id', stepId);
          await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
        }
      }
    }

    // --- 2. DISPATCH NEW IMAGE TASKS ---
    const { count: activeImageTasks } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('step_type', 'generate_image').eq('status', 'running');
    const imageSlotsAvailable = IMAGE_CONCURRENCY - (activeImageTasks || 0);

    if (imageSlotsAvailable > 0) {
      const { data: pendingImageSteps, error: pendingImageError } = await supabaseAdmin.from('automation_run_steps').select('id, input_data, run:automation_runs(user_id)').eq('step_type', 'generate_image').eq('status', 'pending').order('created_at', { ascending: true }).limit(imageSlotsAvailable);
      if (pendingImageError) throw pendingImageError;

      for (const step of pendingImageSteps) {
        await supabaseAdmin.from('automation_run_steps').update({ status: 'running' }).eq('id', step.id);
        supabaseAdmin.functions.invoke('generate-image', { body: { action: 'generate_image', stepId: step.id, userId: step.run.user_id, ...step.input_data } }).catch(err => console.error(`Error invoking generate-image for step ${step.id}:`, err));
      }
    }

    // --- 3. DISPATCH NEW VIDEO TASKS ---
    const { count: activeVideoTasks } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('step_type', 'generate_video').eq('status', 'running');
    const videoSlotsAvailable = VIDEO_CONCURRENCY - (activeVideoTasks || 0);

    if (videoSlotsAvailable > 0) {
      const { data: pendingVideoSteps, error: pendingVideoError } = await supabaseAdmin.from('automation_run_steps').select('id, input_data, run:automation_runs(user_id, channel_id)').eq('step_type', 'generate_video').eq('status', 'pending').order('created_at', { ascending: true }).limit(videoSlotsAvailable);
      if (pendingVideoError) throw pendingVideoError;

      for (const step of pendingVideoSteps) {
        const { data: configData } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', step.run.channel_id).single();
        const duration = configData?.config_data?.videoDuration || 5;

        await supabaseAdmin.from('automation_run_steps').update({ status: 'running' }).eq('id', step.id);
        supabaseAdmin.functions.invoke('automation-worker-video', { body: { stepId: step.id, userId: step.run.user_id, model: 'kling', prompt: step.input_data.prompt, imageUrl: step.input_data.imageUrl, options: { duration, width: 1024, height: 576, resolution: "1080p" } } }).catch(err => console.error(`Error invoking automation-worker-video for step ${step.id}:`, err));
      }
    }

    // --- 4. Process Manual Video Tasks (existing logic) ---
    const { data: manualVideoTasks, error: manualTasksError } = await supabaseAdmin.from('video_tasks').select('id, user_id, higgsfield_task_id').in('status', ['pending', 'processing', 'in_progress']);
    if (manualTasksError) console.error("Error fetching manual video tasks:", manualTasksError.message);
    if (manualVideoTasks) {
      for (const task of manualVideoTasks) {
        try {
          let cachedUser = userCache.get(task.user_id);
          if (!cachedUser) {
            const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('higgsfield_cookie, higgsfield_clerk_context').eq('id', task.user_id).single();
            if (settingsError || !settings) { userCache.set(task.user_id, { token: null }); continue; }
            const token = await getHiggsfieldToken(settings.higgsfield_cookie, settings.higgsfield_clerk_context);
            cachedUser = { token };
            userCache.set(task.user_id, cachedUser);
          } else if (!cachedUser.token) continue;

          const statusData = await getTaskStatus(cachedUser.token, task.higgsfield_task_id);
          const job = statusData?.jobs?.[0];
          const apiStatus = job?.status;

          if (apiStatus && ['completed', 'failed', 'nsfw'].includes(apiStatus)) {
            const newStatus = apiStatus === 'completed' ? 'completed' : 'failed';
            const resultUrl = job?.results?.raw?.url;
            const errorMessage = job?.error || (apiStatus === 'nsfw' ? 'Nội dung không phù hợp (NSFW).' : `Tác vụ thất bại không có thông báo lỗi cụ thể.`);
            await supabaseAdmin.from('video_tasks').update({ status: newStatus, result_url: resultUrl, error_message: newStatus === 'failed' ? errorMessage : null }).eq('id', task.id);
          }
        } catch (e) {
          await supabaseAdmin.from('video_tasks').update({ status: 'failed', error_message: e.message }).eq('id', task.id);
        }
      }
    }

    return new Response(JSON.stringify({ message: 'Dispatcher run complete.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[FATAL] Lỗi trong check-task-status:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});