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

async function startNextSubProduct(supabaseAdmin, run, currentSubProductId, userCache) {
    const { data: channel, error: channelError } = await supabaseAdmin.from('channels').select('product_id, character_image_url').eq('id', run.channel_id).single();
    if (channelError || !channel) throw new Error(`Không tìm thấy kênh ${run.channel_id}`);

    const { data: allSubProducts, error: subProductsError } = await supabaseAdmin
        .from('sub_products').select('id, name, description, image_url').eq('product_id', channel.product_id).order('created_at', { ascending: true });
    if (subProductsError) throw subProductsError;

    const currentIndex = allSubProducts.findIndex(p => p.id === currentSubProductId);
    if (currentIndex === -1 || currentIndex + 1 >= allSubProducts.length) {
        // This was the last sub-product, check if the whole run is complete
        const { data: remainingSteps, error: remainingError } = await supabaseAdmin.from('automation_run_steps').select('id').eq('run_id', run.id).in('status', ['pending', 'running']);
        if (remainingError) throw remainingError;
        if (remainingSteps.length === 0) {
            await logToDb(supabaseAdmin, run.id, 'Tất cả các sản phẩm con đã được xử lý. Hoàn tất phiên chạy.', 'SUCCESS');
            await supabaseAdmin.from('automation_runs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', run.id);
        }
        return;
    }

    const nextSubProduct = allSubProducts[currentIndex + 1];
    await logToDb(supabaseAdmin, run.id, `Bắt đầu xử lý sản phẩm con tiếp theo: "${nextSubProduct.name}".`);

    let cachedUser = userCache.get(run.user_id);
    if (!cachedUser || !cachedUser.settings) {
        const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('*').eq('id', run.user_id).single();
        if (settingsError || !settings) throw new Error(`Không tìm thấy cài đặt cho user ${run.user_id}`);
        cachedUser = { ...cachedUser, settings };
        userCache.set(run.user_id, cachedUser);
    }

    const { data: configData, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', run.channel_id).single();
    if (configError || !configData) throw new Error(`Không tìm thấy cấu hình cho kênh ${run.channel_id}`);
    const config = configData.config_data;

    const geminiPrompt = replacePlaceholders(config.imagePromptGenerationTemplate, { product_name: nextSubProduct.name, product_description: nextSubProduct.description, image_count: config.imageCount });
    const { data: geminiResult, error: geminiError } = await supabaseAdmin.functions.invoke('proxy-gemini-api', { body: { apiUrl: cachedUser.settings.gemini_api_url, prompt: geminiPrompt, token: cachedUser.settings.gemini_api_key } });
    if (geminiError || !geminiResult.success) throw new Error(`Lỗi tạo prompt ảnh từ AI cho sản phẩm tiếp theo: ${geminiError?.message || geminiResult?.error}`);

    const imagePrompts = [...geminiResult.answer.matchAll(/<prompt>(.*?)<\/prompt>/gs)].map(match => match[1].trim());
    if (imagePrompts.length === 0) throw new Error(`AI không trả về prompt ảnh cho sản phẩm "${nextSubProduct.name}".`);

    const imageUrls = [channel.character_image_url, nextSubProduct.image_url].filter(Boolean);
    for (const imagePrompt of imagePrompts) {
        const inputData = { prompt: imagePrompt, model: 'banana', aspect_ratio: '1:1', image_urls: imageUrls };
        const { data: step, error: stepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: run.id, sub_product_id: nextSubProduct.id, step_type: 'generate_image', status: 'pending', input_data: inputData }).select('id').single();
        if (stepError) throw stepError;
        await logToDb(supabaseAdmin, run.id, `Đã tạo bước 'Tạo Ảnh' cho sản phẩm con: ${nextSubProduct.name}`, 'INFO', step.id);
        supabaseAdmin.functions.invoke('generate-image', { body: { action: 'generate_image', stepId: step.id, userId: run.user_id, ...inputData } }).catch(err => console.error(`Lỗi gọi generate-image cho bước ${step.id}:`, err));
    }
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
    const userCache = new Map();

    // --- Process Manual Video Tasks ---
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
            const errorMessage = job?.error || (apiStatus === 'nsfw' ? 'Nội dung không phù hợp (NSFW).' : `Tác vụ thất bại không có thông báo lỗi cụ thể. Dữ liệu API: ${JSON.stringify(job || statusData)}`);
            await supabaseAdmin.from('video_tasks').update({ status: newStatus, result_url: resultUrl, error_message: newStatus === 'failed' ? errorMessage : null }).eq('id', task.id);
          }
        } catch (e) {
          await supabaseAdmin.from('video_tasks').update({ status: 'failed', error_message: e.message }).eq('id', task.id);
        }
      }
    }

    // --- Process Automation Steps ---
    const { data: runningSteps, error: stepsError } = await supabaseAdmin.from('automation_run_steps').select(`*, run:automation_runs(id, channel_id, user_id)`).eq('status', 'running').not('api_task_id', 'is', null);
    if (stepsError) throw stepsError;
    
    if (runningSteps) {
        for (const step of runningSteps) {
          const runId = step.run.id;
          const stepId = step.id;
          try {
            if (step.step_type === 'generate_voice') continue;

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
              const errorMessage = job?.error || (apiStatus === 'nsfw' ? 'Nội dung không phù hợp (NSFW).' : `Tác vụ thất bại không có thông báo lỗi cụ thể. Dữ liệu API: ${JSON.stringify(job || statusData)}`);

              if (newStatus === 'failed') {
                  await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: errorMessage }).eq('id', stepId);
                  await logToDb(supabaseAdmin, runId, `Bước ${stepId} (${step.step_type}) đã thất bại. Dừng phiên chạy. Lỗi: ${errorMessage}`, 'ERROR', stepId);
                  await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
                  continue; // Stop processing this run further
              }

              // If completed
              await supabaseAdmin.from('automation_run_steps').update({ status: 'completed', output_data: { url: resultUrl }, error_message: null }).eq('id', stepId);
              await logToDb(supabaseAdmin, runId, `Bước ${stepId} (${step.step_type}) đã hoàn thành.`, 'SUCCESS', stepId);

              const { data: config, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', step.run.channel_id).single();
              if (configError || !config) throw new Error(`Không tìm thấy cấu hình cho kênh ${step.run.channel_id}`);

              if (step.step_type === 'generate_image') {
                  const { data: subProduct, error: subProductError } = await supabaseAdmin.from('sub_products').select('name, description').eq('id', step.sub_product_id).single();
                  if (subProductError) throw subProductError;

                  const geminiVideoPrompt = replacePlaceholders(config.config_data.videoPromptGenerationTemplate, { image_prompt: step.input_data.prompt, product_name: subProduct.name, product_description: subProduct.description });
                  const { data: geminiResponse, error: geminiError } = await supabaseAdmin.functions.invoke('proxy-gemini-api', { body: { apiUrl: cachedUser.settings.gemini_api_url, prompt: geminiVideoPrompt, token: cachedUser.settings.gemini_api_key } });
                  if (geminiError || !geminiResponse.success) throw new Error(`Lỗi tạo prompt video từ AI: ${geminiError?.message || geminiResponse?.error}`);
                  
                  const finalVideoPrompt = geminiResponse.answer;
                  if (!finalVideoPrompt) throw new Error("AI không trả về prompt video.");

                  const videoInputData = { prompt: finalVideoPrompt, imageUrl: resultUrl, model: 'kling', source_image_step_id: step.id, gemini_prompt_for_video: geminiVideoPrompt };
                  const { data: videoStep, error: videoStepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: runId, sub_product_id: step.sub_product_id, step_type: 'generate_video', status: 'pending', input_data: videoInputData }).select('id').single();
                  if (videoStepError) throw videoStepError;
                  
                  supabaseAdmin.functions.invoke('automation-worker-video', { body: JSON.stringify({ stepId: videoStep.id, userId: step.run.user_id, model: 'kling', prompt: finalVideoPrompt, imageUrl: resultUrl, options: { duration: config.config_data.videoDuration || 5, width: 1024, height: 576, resolution: "1080p" } }) }).catch(console.error);
              } else if (step.step_type === 'generate_video') {
                  // This is the last step for a sub-product, trigger the next one
                  await startNextSubProduct(supabaseAdmin, step.run, step.sub_product_id, userCache);
              }
            }
          } catch (e) {
            await logToDb(supabaseAdmin, runId, `Không thể xử lý bước ${stepId}: ${e.message}`, 'ERROR', stepId);
            await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: e.message }).eq('id', stepId);
            await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
          }
        }
    }

    return new Response(JSON.stringify({ message: 'Kiểm tra hoàn tất.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[FATAL] Lỗi trong check-task-status:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});