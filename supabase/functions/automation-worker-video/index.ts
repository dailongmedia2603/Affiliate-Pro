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
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Lỗi khi lấy token từ Higgsfield: ${tokenResponse.status} - ${errorText}`);
  }
  const tokenData = await tokenResponse.json();
  if (!tokenData || !tokenData.jwt) {
    throw new Error('Phản hồi từ Higgsfield không chứa token (jwt). Điều này có thể do Cookie hoặc Clerk Context không hợp lệ hoặc đã hết hạn.');
  }
  return tokenData.jwt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  const { userId, stepId, model, prompt, imageUrl, options } = await req.json();
  let runId = null;

  try {
    if (!userId || !stepId || !model) {
      throw new Error("Lỗi nội bộ: Thiếu userId, stepId, hoặc model khi gọi worker.");
    }

    const { data: stepData, error: stepError } = await supabaseAdmin.from('automation_run_steps').select('run_id').eq('id', stepId).single();
    if (stepError || !stepData) throw new Error(`Không tìm thấy bước ${stepId}`);
    runId = stepData.run_id;

    await logToDb(supabaseAdmin, runId, `Bắt đầu worker tạo video.`, 'INFO', stepId);

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('higgsfield_cookie, higgsfield_clerk_context')
      .eq('id', userId)
      .single();

    if (settingsError || !settings) {
      throw new Error(`Không tìm thấy cài đặt Higgsfield cho người dùng: ${userId}.`);
    }
    const { higgsfield_cookie, higgsfield_clerk_context } = settings;
    if (!higgsfield_cookie || !higgsfield_clerk_context) {
        throw new Error('Chưa cấu hình đầy đủ Cookie và Clerk Context cho Higgsfield.');
    }

    const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);
    await logToDb(supabaseAdmin, runId, 'Đã lấy token Higgsfield thành công.', 'INFO', stepId);

    let input_image = null;
    if (imageUrl) {
        await logToDb(supabaseAdmin, runId, `Đang đăng ký media URL: ${imageUrl}`, 'INFO', stepId);
        const uploadPayload = { token, url: [imageUrl], cookie: higgsfield_cookie, clerk_active_context: higgsfield_clerk_context };
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

        if (!uploadResponse.ok) {
            throw new Error(`Lỗi đăng ký media: ${uploadResponseText}`);
        }
        
        if (uploadResponseData?.status === true && uploadResponseData.data) {
            input_image = uploadResponseData.data;
            await logToDb(supabaseAdmin, runId, 'Đăng ký media URL thành công.', 'SUCCESS', stepId);
        } else {
            throw new Error(`Đăng ký media thất bại: ${JSON.stringify(uploadResponseData)}`);
        }
    }

    let endpoint = '';
    let apiPayload = {};
    const basePayload = { token, prompt, input_image, ...options };

    switch (model) {
        case 'kling':
            endpoint = `${API_BASE}/video/kling2.1`;
            apiPayload = { ...basePayload, model: "kling-v2-5-turbo", motion_id: "7077cde8-7947-46d6-aea2-dbf2ff9d441c" };
            break;
        default:
            throw new Error(`Model video không được hỗ trợ: ${model}`);
    }

    await logToDb(supabaseAdmin, runId, `Calling video generation API`, 'INFO', stepId, {
        endpoint: endpoint,
        payload: { ...apiPayload, token: '[REDACTED]' }
    });

    const generationResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload)
    });

    const genResponseText = await generationResponse.text();
    let generationData;
    try { generationData = JSON.parse(genResponseText); } catch (e) { generationData = { raw_response: genResponseText }; }

    await logToDb(supabaseAdmin, runId, `Received response from video generation API`, generationResponse.ok ? 'INFO' : 'ERROR', stepId, {
        response: generationData
    });

    if (!generationResponse.ok) {
        throw new Error(`Tạo video thất bại: ${genResponseText}`);
    }

    if (!generationData.job_sets || generationData.job_sets.length === 0) {
        throw new Error(`Phản hồi từ API tạo video không hợp lệ. Phản hồi: ${JSON.stringify(generationData)}`);
    }
    
    const newTaskId = generationData.job_sets[0].id;
    await supabaseAdmin.from('automation_run_steps').update({ api_task_id: newTaskId }).eq('id', stepId);
    await logToDb(supabaseAdmin, runId, `Đã nhận ID tác vụ từ API: ${newTaskId}.`, 'SUCCESS', stepId);

    return new Response(JSON.stringify({ success: true, taskId: newTaskId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    if (runId && stepId) {
        await logToDb(supabaseAdmin, runId, `Worker video thất bại với lỗi nghiêm trọng: ${error.message}`, 'ERROR', stepId);
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});