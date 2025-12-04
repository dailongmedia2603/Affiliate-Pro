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
  const tokenResponse = await fetch(`${API_BASE}/gettoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie, clerk_active_context }),
  });
  if (!tokenResponse.ok) throw new Error(`Lỗi khi lấy token từ Higgsfield: ${await tokenResponse.text()}`);
  const tokenData = await tokenResponse.json();
  if (!tokenData.jwt) throw new Error('Phản hồi từ Higgsfield không chứa token (jwt).');
  return tokenData.jwt;
}

serve(async (req) => {
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  let runId = null;
  let stepId = null;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  
  const body = await req.json();
  const { action, userId: payloadUserId, ...payload } = body;
  stepId = payload.stepId;

  let userId;
  if (payloadUserId) {
      userId = payloadUserId;
  } else {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
      );
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user) throw new Error("Không thể xác thực người dùng.");
      userId = user.id;
  }
  
  if (!userId) throw new Error("Không thể xác định người dùng.");

  if (stepId) {
      const { data: stepData, error: stepError } = await supabaseAdmin.from('automation_run_steps').select('run_id').eq('id', stepId).single();
      if (stepError || !stepData) throw new Error(`Không tìm thấy phiên chạy cho bước ${stepId}`);
      runId = stepData.run_id;
  }

  await logToDb(supabaseAdmin, runId, `Function 'generate-image' đã bắt đầu.`, 'INFO', stepId);

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('user_settings').select('higgsfield_cookie, higgsfield_clerk_context').eq('id', userId).single();

  if (settingsError || !settings || !settings.higgsfield_cookie || !settings.higgsfield_clerk_context) {
    throw new Error('Không tìm thấy thông tin xác thực Higgsfield.');
  }
  const { higgsfield_cookie, higgsfield_clerk_context } = settings;
  const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);
  await logToDb(supabaseAdmin, runId, 'Đã lấy token Higgsfield thành công.', 'INFO', stepId);

  if (action === 'generate_image') {
    const { model, prompt, image_urls, aspect_ratio } = payload;
    if (!model || !prompt) throw new Error("Model và prompt là bắt buộc.");
    if (model !== 'banana') throw new Error(`Model ảnh không được hỗ trợ: ${model}`);

    let input_image = [];
    if (image_urls && image_urls.length > 0) {
      await logToDb(supabaseAdmin, runId, `Đang đăng ký ${image_urls.length} media URL.`, 'INFO', stepId);
      const uploadPayload = { token, url: image_urls, cookie: higgsfield_cookie, clerk_active_context: higgsfield_clerk_context };
      const uploadEndpoint = `${API_BASE}/img/uploadmediav2`;

      await logToDb(supabaseAdmin, runId, `Calling uploadmediav2 API`, 'INFO', stepId, {
          endpoint: uploadEndpoint,
          payload: { ...uploadPayload, token: '[REDACTED]', cookie: '[REDACTED]', clerk_active_context: '[REDACTED]' }
      });

      const uploadResponse = await fetch(uploadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uploadPayload) });
      
      const uploadResponseText = await uploadResponse.text();
      let uploadResponseData;
      try { uploadResponseData = JSON.parse(uploadResponseText); } catch (e) { uploadResponseData = { raw_response: uploadResponseText }; }
      
      await logToDb(supabaseAdmin, runId, `Received response from uploadmediav2 API`, uploadResponse.ok ? 'INFO' : 'ERROR', stepId, {
          response: uploadResponseData
      });

      if (!uploadResponse.ok) throw new Error(`Lỗi đăng ký media: ${uploadResponseText}`);
      
      if (uploadResponseData?.status === true && uploadResponseData.data) {
        input_image = uploadResponseData.data;
        await logToDb(supabaseAdmin, runId, 'Đăng ký media URL thành công.', 'SUCCESS', stepId);
      } else {
        throw new Error(`Đăng ký media thất bại: ${JSON.stringify(uploadResponseData)}`);
      }
    }

    let logId;
    let logTable = stepId ? 'automation_run_steps' : 'higgsfield_generation_logs';
    let logIdField = 'id';
    logId = stepId;

    if (!stepId) {
      const { data: log, error: logError } = await supabaseAdmin.from(logTable).insert({ user_id: userId, model, prompt, status: 'processing' }).select(logIdField).single();
      if (logError) throw logError;
      logId = log[logIdField];
    }
    
    await logToDb(supabaseAdmin, runId, 'Đang gọi API Higgsfield để tạo ảnh...', 'INFO', stepId);
    const endpoint = `${API_BASE}/img/banana`;
    const apiPayload = { token, prompt, input_image, width: 1024, height: 1024, aspect_ratio, batch_size: 1 };

    await logToDb(supabaseAdmin, runId, `Calling banana API`, 'INFO', stepId, {
        endpoint: endpoint,
        payload: { ...apiPayload, token: '[REDACTED]' }
    });

    const generationResponse = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(apiPayload) });
    
    const responseText = await generationResponse.text();
    let generationData;
    try { generationData = JSON.parse(responseText); } catch (e) { generationData = { raw_response: responseText }; }

    await logToDb(supabaseAdmin, runId, `Received response from banana API`, generationResponse.ok ? 'INFO' : 'ERROR', stepId, {
        response: generationData
    });

    if (!generationResponse.ok) {
      throw new Error(`Tạo ảnh thất bại (status ${generationResponse.status}): ${responseText}`);
    }
    if (!responseText) {
      throw new Error('API tạo ảnh trả về một phản hồi rỗng. Prompt có thể không hợp lệ hoặc có vấn đề với API.');
    }

    if (!generationData || !generationData.job_sets || generationData.job_sets.length === 0) {
      const apiError = generationData?.message || generationData?.error || JSON.stringify(generationData);
      throw new Error(`Phản hồi từ API tạo ảnh không hợp lệ: ${apiError}`);
    }
    
    const api_task_id = generationData.job_sets[0].id;
    await logToDb(supabaseAdmin, runId, `Đã nhận ID tác vụ từ API: ${api_task_id}.`, 'SUCCESS', stepId);

    await supabaseAdmin.from(logTable).update({ api_task_id: api_task_id }).eq(logIdField, logId);

    return new Response(JSON.stringify({ success: true, logId: logId, taskId: api_task_id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } else {
    throw new Error(`Hành động không hợp lệ: ${action}`);
  }
});