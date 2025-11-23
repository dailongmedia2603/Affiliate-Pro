// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const IMAGE_CONCURRENCY = 4;
const VIDEO_CONCURRENCY = 3;
const MERGE_CONCURRENCY = 2;
const VOICE_CONCURRENCY = 2;
const MAX_RETRIES = 2;
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

const handleStepFailure = async (supabaseAdmin, step, errorMessage) => {
    const runId = step.run.id;
    const stepId = step.id;
    const currentRetryCount = step.retry_count || 0;

    if (currentRetryCount < MAX_RETRIES) {
        await logToDb(supabaseAdmin, runId, `Bước ${step.step_type} thất bại. Thử lại lần ${currentRetryCount + 1}/${MAX_RETRIES}. Lỗi: ${errorMessage}`, 'WARN', stepId);
        await supabaseAdmin.from('automation_run_steps').update({ status: 'pending', retry_count: currentRetryCount + 1 }).eq('id', stepId);
    } else {
        await logToDb(supabaseAdmin, runId, `Bước ${step.step_type} đã thất bại sau ${MAX_RETRIES} lần thử lại. Dừng phiên chạy. Lỗi: ${errorMessage}`, 'ERROR', stepId);
        await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: errorMessage }).eq('id', stepId);
        await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
    }
};


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
    // --- UN-STUCK RUNS ---
    const { data: activeRuns, error: activeRunsError } = await supabaseAdmin
      .from('automation_runs')
      .select('id, user_id, channel_id')
      .eq('status', 'running');

    if (activeRunsError) throw activeRunsError;

    if (activeRuns) {
      for (const run of activeRuns) {
        const { data: allSteps, error: allStepsError } = await supabaseAdmin
          .from('automation_run_steps')
          .select('id, step_type, status, sub_product_id, output_data, input_data')
          .eq('run_id', run.id);
        
        if (allStepsError) {
          console.error(`Could not get steps for run ${run.id}`);
          continue;
        }

        const stepsBySubProduct = allSteps.reduce((acc, step) => {
          if (!step.sub_product_id) return acc;
          if (!acc[step.sub_product_id]) {
            acc[step.sub_product_id] = [];
          }
          acc[step.sub_product_id].push(step);
          return acc;
        }, {});

        for (const subProductId in stepsBySubProduct) {
          const subProductSteps = stepsBySubProduct[subProductId];
          
          const voiceStep = subProductSteps.find(s => s.step_type === 'generate_voice');
          const mergeStep = subProductSteps.find(s => s.step_type === 'merge_videos');

          if (voiceStep && voiceStep.status === 'completed' && !mergeStep) {
            await logToDb(supabaseAdmin, run.id, `Phát hiện trạng thái bị kẹt: voice đã hoàn thành nhưng chưa có bước ghép video. Tự động tạo bước ghép.`, 'WARN', voiceStep.id);

            const videosToMergeRaw = allSteps.filter(s => s.sub_product_id === subProductId && s.step_type === 'generate_video' && s.status === 'completed');

            if (!videosToMergeRaw || videosToMergeRaw.length === 0) {
              await logToDb(supabaseAdmin, run.id, `Không thể tìm thấy video đã hoàn thành để ghép cho sub-product ${subProductId}.`, 'ERROR', voiceStep.id);
              continue;
            }

            const videosToMerge = videosToMergeRaw.sort((a, b) => (a.input_data?.sequence_number ?? Infinity) - (b.input_data?.sequence_number ?? Infinity));
            const videoUrls = videosToMerge.map(v => v.output_data.url);
            const audioUrl = voiceStep.output_data.url;

            if (!audioUrl) {
              await logToDb(supabaseAdmin, run.id, `Bước voice hoàn thành nhưng không có URL audio. Không thể tạo bước ghép.`, 'ERROR', voiceStep.id);
              continue;
            }

            const mergeInputData = { video_urls: videoUrls, audio_url: audioUrl };

            const { error: mergeStepError } = await supabaseAdmin.from('automation_run_steps').insert({
              run_id: run.id,
              sub_product_id: subProductId,
              step_type: 'merge_videos',
              status: 'pending',
              input_data: mergeInputData
            });

            if (mergeStepError) {
              await logToDb(supabaseAdmin, run.id, `Lỗi khi tự động tạo bước ghép video bị thiếu: ${mergeStepError.message}`, 'ERROR', voiceStep.id);
            } else {
              await logToDb(supabaseAdmin, run.id, `Đã tự động tạo và xếp hàng bước ghép video bị thiếu.`, 'SUCCESS', voiceStep.id);
            }
          }
        }
      }
    }

    // --- UPDATE RUNNING TASKS ---
    const { data: runningSteps, error: stepsError } = await supabaseAdmin
      .from('automation_run_steps')
      .select(`*, run:automation_runs(id, channel_id, user_id)`)
      .eq('status', 'running')
      .not('api_task_id', 'is', null);

    if (stepsError) throw stepsError;
    
    if (runningSteps) {
      for (const step of runningSteps) {
        try {
          let cachedUser = userCache.get(step.run.user_id);
          if (!cachedUser) {
            const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('*').eq('id', step.run.user_id).single();
            if (settingsError || !settings) {
              userCache.set(step.run.user_id, { token: null, settings: null });
              throw new Error(`Không tìm thấy cài đặt cho người dùng ${step.run.user_id}`);
            }
            cachedUser = { settings };
            userCache.set(step.run.user_id, cachedUser);
          } else if (!cachedUser.settings) {
            throw new Error(`Không tìm thấy cài đặt đã cache cho người dùng ${step.run.user_id}`);
          }

          if (['generate_image', 'generate_video'].includes(step.step_type)) {
            if (!cachedUser.token) {
              const token = await getHiggsfieldToken(cachedUser.settings.higgsfield_cookie, cachedUser.settings.higgsfield_clerk_context);
              cachedUser.token = token;
              userCache.set(step.run.user_id, cachedUser);
            }

            const statusData = await getTaskStatus(cachedUser.token, step.api_task_id);
            const job = statusData?.jobs?.[0];
            const apiStatus = job?.status;

            if (apiStatus && ['completed', 'failed', 'nsfw'].includes(apiStatus)) {
              const isSuccess = apiStatus === 'completed';
              const resultUrl = job?.results?.raw?.url;
              const errorMessage = job?.error || (apiStatus === 'nsfw' ? 'Nội dung không phù hợp (NSFW).' : `Tác vụ thất bại không có thông báo lỗi cụ thể.`);

              if (!isSuccess) {
                  await handleStepFailure(supabaseAdmin, step, errorMessage);
                  continue;
              }

              await supabaseAdmin.from('automation_run_steps').update({ status: 'completed', output_data: { url: resultUrl }, error_message: null }).eq('id', step.id);
              await logToDb(supabaseAdmin, step.run.id, `Bước ${step.step_type} đã hoàn thành.`, 'SUCCESS', step.id);

              if (step.step_type === 'generate_image') {
                const { data: config, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', step.run.channel_id).single();
                if (configError || !config) throw new Error(`Không tìm thấy cấu hình cho kênh ${step.run.channel_id}`);
                
                const { data: subProduct, error: subProductError } = await supabaseAdmin.from('sub_products').select('name, description').eq('id', step.sub_product_id).single();
                if (subProductError) throw subProductError;

                const geminiVideoPrompt = replacePlaceholders(config.config_data.videoPromptGenerationTemplate, { image_prompt: step.input_data.prompt, product_name: subProduct.name, product_description: subProduct.description });
                const { data: geminiResponse, error: geminiError } = await supabaseAdmin.functions.invoke('proxy-vertex-ai', { body: { userId: step.run.user_id, prompt: geminiVideoPrompt } });
                if (geminiError || !geminiResponse.success) throw new Error(`Lỗi tạo prompt video từ AI: ${geminiError?.message || geminiResponse?.error}`);
                
                const finalVideoPrompt = geminiResponse.data;
                if (!finalVideoPrompt) throw new Error("AI không trả về prompt video.");

                const sequence_number = step.input_data?.sequence_number;
                const videoInputData = { prompt: finalVideoPrompt, imageUrl: resultUrl, source_image_step_id: step.id, gemini_prompt_for_video: geminiVideoPrompt, sequence_number: sequence_number };
                const { error: videoStepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: step.run.id, sub_product_id: step.sub_product_id, step_type: 'generate_video', status: 'pending', input_data: videoInputData });
                if (videoStepError) throw videoStepError;
                await logToDb(supabaseAdmin, step.run.id, `Đã xếp hàng bước tạo video.`, 'INFO');
              } 
              else if (step.step_type === 'generate_video') {
                const { count: totalImageSteps } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('run_id', step.run.id).eq('sub_product_id', step.sub_product_id).eq('step_type', 'generate_image');
                const { count: completedVideoSteps } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('run_id', step.run.id).eq('sub_product_id', step.sub_product_id).eq('step_type', 'generate_video').eq('status', 'completed');

                if (totalImageSteps > 0 && totalImageSteps === completedVideoSteps) {
                    await logToDb(supabaseAdmin, step.run.id, `Tất cả ${completedVideoSteps} video cho sản phẩm con đã hoàn thành. Chuẩn bị tạo voice.`, 'SUCCESS', step.sub_product_id);
                    const { error: voiceStepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: step.run.id, sub_product_id: step.sub_product_id, step_type: 'generate_voice', status: 'pending' });
                    if (voiceStepError) throw voiceStepError;
                    await logToDb(supabaseAdmin, step.run.id, `Đã xếp hàng bước tạo voice.`, 'INFO');
                }
              }
            }
          }
          else if (step.step_type === 'generate_voice') {
             const { data: statusData, error: statusError } = await supabaseAdmin.functions.invoke('proxy-voice-api', { body: { path: `v1/task/${step.api_task_id}`, token: cachedUser.settings.voice_api_key, method: 'GET' } });
             if (statusError) throw statusError;
             if (statusData.status === 'done') {
                const audioUrl = statusData.metadata?.audio_url;
                if (!audioUrl) throw new Error("Tác vụ voice hoàn thành nhưng không có URL audio.");
                
                await supabaseAdmin.from('automation_run_steps').update({ status: 'completed', output_data: { url: audioUrl } }).eq('id', step.id);
                await logToDb(supabaseAdmin, step.run.id, "Bước tạo voice đã hoàn thành. Chuẩn bị ghép video.", 'SUCCESS', step.id);

                const { data: videosToMergeRaw, error: videosError } = await supabaseAdmin.from('automation_run_steps').select('output_data, input_data').eq('run_id', step.run.id).eq('sub_product_id', step.sub_product_id).eq('step_type', 'generate_video').eq('status', 'completed');
                if (videosError || !videosToMergeRaw || videosToMergeRaw.length === 0) throw new Error(`Không thể truy xuất URL video để ghép: ${videosError?.message || 'Không tìm thấy video'}`);
                
                const videosToMerge = videosToMergeRaw.sort((a, b) => (a.input_data?.sequence_number ?? Infinity) - (b.input_data?.sequence_number ?? Infinity));
                const videoUrls = videosToMerge.map(v => v.output_data.url);
                const mergeInputData = { video_urls: videoUrls, audio_url: audioUrl };

                const { error: mergeStepError } = await supabaseAdmin.from('automation_run_steps').insert({ run_id: step.run.id, sub_product_id: step.sub_product_id, step_type: 'merge_videos', status: 'pending', input_data: mergeInputData });
                if (mergeStepError) throw mergeStepError;
                await logToDb(supabaseAdmin, step.run.id, `Đã xếp hàng bước ghép video với audio.`, 'INFO');
             } else if (statusData.status === 'error') {
                await handleStepFailure(supabaseAdmin, step, statusData.error_message || 'Lỗi không xác định từ API voice');
             }
          }
          else if (step.step_type === 'merge_videos') {
            const rendiApiKey = cachedUser.settings.rendi_api_key;
            if (!rendiApiKey) throw new Error(`Không tìm thấy Rendi API key cho người dùng ${step.run.user_id}`);

            const { data: rendiStatus, error: rendiError } = await supabaseAdmin.functions.invoke('proxy-rendi-api', { body: { action: 'check_status', payload: { command_id: step.api_task_id }, rendi_api_key: rendiApiKey } });
            if (rendiError) throw rendiError;
            if (rendiStatus.error) throw new Error(rendiStatus.error);

            const apiStatus = rendiStatus.status;
            if (['SUCCESS', 'FAILED'].includes(apiStatus)) {
              const isSuccess = apiStatus === 'SUCCESS';
              const finalVideoUrl = rendiStatus.output_files?.out_final?.storage_url;
              const errorMessage = rendiStatus.error_message || 'Tác vụ Rendi thất bại không có lỗi cụ thể.';

              if (!isSuccess) { await handleStepFailure(supabaseAdmin, step, errorMessage); continue; }
              if (!finalVideoUrl) { await handleStepFailure(supabaseAdmin, step, 'Tác vụ Rendi thành công nhưng không tìm thấy URL video cuối cùng.'); continue; }

              await supabaseAdmin.from('automation_run_steps').update({ status: 'completed', output_data: { final_video_url: finalVideoUrl }, error_message: null }).eq('id', step.id);
              await logToDb(supabaseAdmin, step.run.id, `Bước ghép video đã hoàn thành.`, 'SUCCESS', step.id);

              const { count: remainingSteps } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('run_id', step.run.id).in('status', ['pending', 'running']);
              if (remainingSteps === 0) {
                await logToDb(supabaseAdmin, step.run.id, 'Tất cả các bước đã hoàn thành. Kết thúc phiên chạy.', 'SUCCESS');
                await supabaseAdmin.from('automation_runs').update({ status: 'completed', finished_at: new Date().toISOString() }).eq('id', step.run.id);
              }
            }
          }
        } catch (e) {
          await handleStepFailure(supabaseAdmin, step, e.message);
        }
      }
    }

    // --- DISPATCH NEW TASKS ---
    const { count: activeImageTasks } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('step_type', 'generate_image').eq('status', 'running');
    const imageSlotsAvailable = IMAGE_CONCURRENCY - (activeImageTasks || 0);
    if (imageSlotsAvailable > 0) {
      const { data: pendingImageSteps } = await supabaseAdmin.from('automation_run_steps').select('id, input_data, run:automation_runs(user_id)').eq('step_type', 'generate_image').eq('status', 'pending').order('created_at', { ascending: true }).limit(imageSlotsAvailable);
      if (pendingImageSteps) for (const step of pendingImageSteps) {
        await supabaseAdmin.from('automation_run_steps').update({ status: 'running' }).eq('id', step.id);
        supabaseAdmin.functions.invoke('generate-image', { body: { action: 'generate_image', stepId: step.id, userId: step.run.user_id, ...step.input_data } }).catch(err => console.error(`Error invoking generate-image for step ${step.id}:`, err));
      }
    }

    const { count: activeVideoTasks } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('step_type', 'generate_video').eq('status', 'running');
    const videoSlotsAvailable = VIDEO_CONCURRENCY - (activeVideoTasks || 0);
    if (videoSlotsAvailable > 0) {
      const { data: pendingVideoSteps } = await supabaseAdmin.from('automation_run_steps').select('id, input_data, run:automation_runs(user_id, channel_id)').eq('step_type', 'generate_video').eq('status', 'pending').order('created_at', { ascending: true }).limit(videoSlotsAvailable);
      if (pendingVideoSteps) for (const step of pendingVideoSteps) {
        const { data: configData } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', step.run.channel_id).single();
        const duration = configData?.config_data?.videoDuration || 5;
        await supabaseAdmin.from('automation_run_steps').update({ status: 'running' }).eq('id', step.id);
        supabaseAdmin.functions.invoke('automation-worker-video', { body: { stepId: step.id, userId: step.run.user_id, model: 'kling', prompt: step.input_data.prompt, imageUrl: step.input_data.imageUrl, options: { duration, width: 1024, height: 576, resolution: "1080p" } } }).catch(err => console.error(`Error invoking automation-worker-video for step ${step.id}:`, err));
      }
    }

    const { count: activeVoiceTasks } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('step_type', 'generate_voice').eq('status', 'running');
    const voiceSlotsAvailable = VOICE_CONCURRENCY - (activeVoiceTasks || 0);
    if (voiceSlotsAvailable > 0) {
        const { data: pendingVoiceSteps } = await supabaseAdmin.from('automation_run_steps').select('id, run:automation_runs(user_id)').eq('step_type', 'generate_voice').eq('status', 'pending').order('created_at', { ascending: true }).limit(voiceSlotsAvailable);
        if (pendingVoiceSteps) for (const step of pendingVoiceSteps) {
            await supabaseAdmin.from('automation_run_steps').update({ status: 'running' }).eq('id', step.id);
            supabaseAdmin.functions.invoke('automation-worker-voice', { body: { stepId: step.id, userId: step.run.user_id } }).catch(err => console.error(`Error invoking automation-worker-voice for step ${step.id}:`, err));
        }
    }

    const { count: activeMergeTasks } = await supabaseAdmin.from('automation_run_steps').select('*', { count: 'exact', head: true }).eq('step_type', 'merge_videos').eq('status', 'running');
    const mergeSlotsAvailable = MERGE_CONCURRENCY - (activeMergeTasks || 0);
    if (mergeSlotsAvailable > 0) {
        const { data: pendingMergeSteps } = await supabaseAdmin.from('automation_run_steps').select('id, run:automation_runs(user_id)').eq('step_type', 'merge_videos').eq('status', 'pending').order('created_at', { ascending: true }).limit(mergeSlotsAvailable);
        if (pendingMergeSteps) for (const step of pendingMergeSteps) {
            await supabaseAdmin.from('automation_run_steps').update({ status: 'running' }).eq('id', step.id);
            supabaseAdmin.functions.invoke('automation-worker-rendi', { body: { stepId: step.id, userId: step.run.user_id } }).catch(err => console.error(`Error invoking automation-worker-rendi for step ${step.id}:`, err));
        }
    }

    // Process Manual Video Tasks
    const { data: manualVideoTasks } = await supabaseAdmin.from('video_tasks').select('id, user_id, higgsfield_task_id').in('status', ['pending', 'processing', 'in_progress']);
    if (manualVideoTasks) for (const task of manualVideoTasks) {
        try {
          let cachedUser = userCache.get(task.user_id);
          if (!cachedUser) {
            const { data: settings } = await supabaseAdmin.from('user_settings').select('higgsfield_cookie, higgsfield_clerk_context').eq('id', task.user_id).single();
            if (!settings) { userCache.set(task.user_id, { token: null }); continue; }
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

    return new Response(JSON.stringify({ message: 'Dispatcher run complete.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[FATAL] Lỗi trong check-task-status:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});