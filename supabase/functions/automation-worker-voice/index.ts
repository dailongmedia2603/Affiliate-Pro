// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logToDb = async (supabaseAdmin, runId, message, level = 'INFO', stepId = null, metadata = {}) => {
  if (!runId) return;
  try {
    await supabaseAdmin.from('automation_run_logs').insert({ run_id: runId, step_id: stepId, message, level, metadata });
  } catch (e) { console.error('Failed to write log to DB:', e.message); }
};

const replacePlaceholders = (template, data) => {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
};

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const { stepId, userId } = await req.json();
  if (!stepId || !userId) throw new Error("Thiếu stepId hoặc userId.");

  const { data: stepData, error: stepErr } = await supabaseAdmin.from('automation_run_steps').select('run_id, sub_product_id').eq('id', stepId).single();
  if (stepErr || !stepData) throw new Error(`Không tìm thấy bước ${stepId}.`);
  const runId = stepData.run_id;

  await logToDb(supabaseAdmin, runId, "Bắt đầu bước tạo voice.", 'INFO', stepId);

  const { data: runData, error: runError } = await supabaseAdmin.from('automation_runs').select('channel_id').eq('id', runId).single();
  if (runError || !runData) throw new Error(`Không tìm thấy phiên chạy ${runId}.`);

  const [configRes, subProductRes, settingsRes] = await Promise.all([
      supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', runData.channel_id).single(),
      supabaseAdmin.from('sub_products').select('name, description').eq('id', stepData.sub_product_id).single(),
      supabaseAdmin.from('user_settings').select('voice_api_key, vertex_ai_service_account').eq('id', userId).single()
  ]);

  if (configRes.error || !configRes.data) throw new Error("Không tìm thấy cấu hình automation.");
  if (subProductRes.error || !subProductRes.data) throw new Error("Không tìm thấy sản phẩm con.");
  if (settingsRes.error || !settingsRes.data) throw new Error("Không tìm thấy cài đặt người dùng.");

  const config = configRes.data.config_data;
  const subProduct = subProductRes.data;
  const settings = settingsRes.data;

  if (!settings.voice_api_key) throw new Error("Chưa cấu hình Voice API Key trong Cài đặt.");
  if (!config.voiceId) throw new Error("Chưa chọn giọng nói trong Cấu hình Automation.");
  if (!config.voiceScriptTemplate) throw new Error("Chưa có mẫu kịch bản voice trong Cấu hình Automation.");

  await logToDb(supabaseAdmin, runId, "Đang tạo kịch bản voice...", 'INFO', stepId);

  let voiceScriptTemplate = config.voiceScriptTemplate;
  if (config.useLibraryPromptForVoice && config.voicePromptId) {
      await logToDb(supabaseAdmin, runId, `Sử dụng prompt kịch bản voice từ thư viện (ID: ${config.voicePromptId}).`, 'INFO', stepId);
      const { data: promptData, error: promptError } = await supabaseAdmin.from('prompts').select('content').eq('id', config.voicePromptId).single();
      if (promptError || !promptData) {
          throw new Error(`Không thể tải prompt kịch bản voice từ thư viện (ID: ${config.voicePromptId}): ${promptError?.message}`);
      }
      voiceScriptTemplate = promptData.content;
  }

  const scriptPrompt = replacePlaceholders(voiceScriptTemplate, { product_name: subProduct.name, product_description: subProduct.description });
  
  const { data: scriptData, error: scriptError } = await supabaseAdmin.functions.invoke('proxy-vertex-ai', {
      body: { prompt: scriptPrompt, userId: userId }
  });

  if (scriptError) throw new Error(`Lỗi gọi function proxy-vertex-ai: ${scriptError.message}`);
  if (scriptData.error) throw new Error(`Lỗi tạo kịch bản: ${scriptData.error}`);
  
  const voiceScript = scriptData.data;
  await logToDb(supabaseAdmin, runId, `Đã tạo kịch bản thành công: "${voiceScript.slice(0, 100)}..."`, 'SUCCESS', stepId);

  const { error: updateInputError } = await supabaseAdmin.from('automation_run_steps').update({
      input_data: {
          script_generation_prompt: scriptPrompt,
          generated_script: voiceScript
      }
  }).eq('id', stepId);

  if (updateInputError) {
      await logToDb(supabaseAdmin, runId, `Lỗi khi lưu log kịch bản: ${updateInputError.message}`, 'WARN', stepId);
  }

  await logToDb(supabaseAdmin, runId, "Đang gửi yêu cầu tạo audio...", 'INFO', stepId);
  const { data: voiceTaskData, error: voiceTaskError } = await supabaseAdmin.functions.invoke('proxy-voice-api', {
      body: {
          path: 'v1m/task/text-to-speech', token: settings.voice_api_key, method: 'POST',
          body: { text: voiceScript, model: 'speech-2.5-hd-preview', voice_setting: { voice_id: config.voiceId, vol: 1, pitch: 0, speed: 1 } }
      }
  });

  if (voiceTaskError) {
    let errorMessage = voiceTaskError.message;
    try {
      // The actual error from the invoked function is in the context
      const errorBody = await voiceTaskError.context.json();
      errorMessage = errorBody.error || errorBody.message || JSON.stringify(errorBody);
    } catch (e) {
      // Ignore if context is not JSON, the original message is enough
    }
    throw new Error(`Lỗi gọi function proxy-voice-api: ${errorMessage}`);
  }

  if (!voiceTaskData.success || !voiceTaskData.task_id) {
      throw new Error(`Gửi yêu cầu TTS thất bại: ${voiceTaskData.error || 'Phản hồi không hợp lệ hoặc không có task_id'}`);
  }
  
  const voiceTaskId = voiceTaskData.task_id;
  await supabaseAdmin.from('automation_run_steps').update({ api_task_id: voiceTaskId }).eq('id', stepId);
  await logToDb(supabaseAdmin, runId, `Đã gửi yêu cầu tạo audio thành công. Task ID: ${voiceTaskId}`, 'SUCCESS', stepId);

  return new Response(JSON.stringify({ success: true, taskId: voiceTaskId }), { headers: corsHeaders });
});