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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  let stepId = null;
  let runId = null;

  try {
    const { stepId: reqStepId, userId } = await req.json();
    stepId = reqStepId;
    if (!stepId || !userId) throw new Error("Thiếu stepId hoặc userId.");

    const { data: stepData, error: stepErr } = await supabaseAdmin.from('automation_run_steps').select('run_id, sub_product_id').eq('id', stepId).single();
    if (stepErr || !stepData) throw new Error(`Không tìm thấy bước ${stepId}.`);
    runId = stepData.run_id;

    await supabaseAdmin.from('automation_run_steps').update({ status: 'running' }).eq('id', stepId);
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
    const scriptPrompt = replacePlaceholders(config.voiceScriptTemplate, { product_name: subProduct.name, product_description: subProduct.description });
    
    const { data: scriptData, error: scriptError } = await supabaseAdmin.functions.invoke('proxy-vertex-ai', {
        body: { prompt: scriptPrompt, userId: userId }
    });

    if (scriptError) throw new Error(`Lỗi gọi function proxy-vertex-ai: ${scriptError.message}`);
    if (scriptData.error) throw new Error(`Lỗi tạo kịch bản: ${scriptData.error}`);
    
    const voiceScript = scriptData.data;
    await logToDb(supabaseAdmin, runId, `Đã tạo kịch bản thành công: "${voiceScript.slice(0, 100)}..."`, 'SUCCESS', stepId);

    await logToDb(supabaseAdmin, runId, "Đang gửi yêu cầu tạo audio...", 'INFO', stepId);
    const { data: voiceTaskData, error: voiceTaskError } = await supabaseAdmin.functions.invoke('proxy-voice-api', {
        body: {
            path: 'v1m/task/text-to-speech', token: settings.voice_api_key, method: 'POST',
            body: { text: voiceScript, model: 'speech-2.5-hd-preview', voice_setting: { voice_id: config.voiceId, vol: 1, pitch: 0, speed: 1 } }
        }
    });

    if (voiceTaskError) throw new Error(`Lỗi gọi function proxy-voice-api: ${voiceTaskError.message}`);
    if (!voiceTaskData.success || !voiceTaskData.task_id) {
        throw new Error(`Gửi yêu cầu TTS thất bại: ${voiceTaskData.error || 'Phản hồi không hợp lệ hoặc không có task_id'}`);
    }
    
    const voiceTaskId = voiceTaskData.task_id;
    await supabaseAdmin.from('automation_run_steps').update({ api_task_id: voiceTaskId }).eq('id', stepId);
    await logToDb(supabaseAdmin, runId, `Đã gửi yêu cầu tạo audio thành công. Task ID: ${voiceTaskId}`, 'SUCCESS', stepId);

    let attempts = 0;
    const maxAttempts = 60;
    while (attempts < maxAttempts) {
        await sleep(5000);
        attempts++;
        await logToDb(supabaseAdmin, runId, `Đang kiểm tra trạng thái tác vụ voice (Lần ${attempts})...`, 'INFO', stepId);

        const { data: statusData, error: statusError } = await supabaseAdmin.functions.invoke('proxy-voice-api', {
            body: { path: `v1/task/${voiceTaskId}`, token: settings.voice_api_key, method: 'GET' }
        });

        if (statusError) {
            await logToDb(supabaseAdmin, runId, `Lỗi khi kiểm tra trạng thái: ${statusError.message}`, 'WARN', stepId);
            continue;
        }

        if (statusData.status === 'done') {
            const audioUrl = statusData.metadata?.audio_url;
            if (!audioUrl) throw new Error("Tác vụ voice hoàn thành nhưng không có URL audio.");
            
            await supabaseAdmin.from('automation_run_steps').update({ status: 'completed', output_data: { url: audioUrl } }).eq('id', stepId);
            await logToDb(supabaseAdmin, runId, "Bước tạo voice đã hoàn thành.", 'SUCCESS', stepId);
            return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        if (statusData.status === 'error') {
            throw new Error(`Tác vụ voice thất bại: ${statusData.error_message || 'Lỗi không xác định'}`);
        }
    }
    throw new Error("Tác vụ tạo voice đã quá thời gian chờ.");

  } catch (error) {
    if (stepId) {
        await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: `Lỗi: ${error.message}` }).eq('id', stepId);
    }
    if (runId) {
        await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
        await logToDb(supabaseAdmin, runId, `Bước tạo voice thất bại: ${error.message}`, 'ERROR', stepId);
    }
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});