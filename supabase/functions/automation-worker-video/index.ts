// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HIGGSFIELD_TOKEN_URL = 'https://api.beautyapp.work/gettoken';

async function getHiggsfieldToken(cookie, clerk_active_context) {
  const tokenResponse = await fetch(HIGGSFIELD_TOKEN_URL, {
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
  
  let stepId = null;

  try {
    const { userId, stepId: reqStepId, model, prompt, imageUrl, options } = await req.json();
    stepId = reqStepId;

    if (!userId || !stepId || !model) {
      throw new Error("Lỗi nội bộ: Thiếu userId, stepId, hoặc model khi gọi worker.");
    }

    await supabaseAdmin.from('automation_run_steps').update({ status: 'running' }).eq('id', stepId);

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('higgsfield_cookie, higgsfield_clerk_context')
      .eq('id', userId)
      .single();

    if (settingsError || !settings) {
      throw new Error(`Không tìm thấy cài đặt Higgsfield cho người dùng: ${userId}.`);
    }
    const { higgsfield_cookie, higgsfield_clerk_context } = settings;
    const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);

    const registerMediaUrlForVideo = async (mediaUrl) => {
        if (!mediaUrl) return null;
        const uploadResponse = await fetch("https://api.beautyapp.work/video/uploadmediav2", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, url: [mediaUrl] })
        });
        const uploadData = await uploadResponse.json();
        if (!uploadData.status || !uploadData.data || uploadData.data.length === 0) {
            throw new Error(`Đăng ký media URL cho video thất bại. Phản hồi API: ${JSON.stringify(uploadData)}`);
        }
        return uploadData.data;
    };

    const input_image = await registerMediaUrlForVideo(imageUrl);
    let endpoint = '';
    let apiPayload = {};
    const basePayload = { token, prompt, input_image, ...options };

    switch (model) {
        case 'kling':
            endpoint = 'https://api.beautyapp.work/video/kling2.1';
            apiPayload = { ...basePayload, model: "kling-v2-5-turbo", motion_id: "7077cde8-7947-46d6-aea2-dbf2ff9d441c" };
            break;
        default:
            throw new Error(`Model video không được hỗ trợ: ${model}`);
    }

    const generationResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload)
    });

    if (!generationResponse.ok) {
        const errorText = await generationResponse.text();
        throw new Error(`Tạo video thất bại: ${errorText}`);
    }

    const generationData = await generationResponse.json();
    if (!generationData.job_sets || generationData.job_sets.length === 0) {
        throw new Error('Phản hồi từ API tạo video không hợp lệ.');
    }
    
    const newTaskId = generationData.job_sets[0].id;
    await supabaseAdmin.from('automation_run_steps').update({ api_task_id: newTaskId }).eq('id', stepId);

    return new Response(JSON.stringify({ success: true, taskId: newTaskId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('!!! [LỖI] Đã xảy ra lỗi trong automation-worker-video:', error.message);
    if (stepId) {
        await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: `Lỗi: ${error.message}` }).eq('id', stepId);
        const { data: stepData } = await supabaseAdmin.from('automation_run_steps').select('run_id').eq('id', stepId).single();
        if (stepData?.run_id) {
            await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', stepData.run_id);
            await supabaseAdmin.from('automation_run_logs').insert({ run_id: stepData.run_id, step_id: stepId, message: `Bước tạo video thất bại: ${error.message}`, level: 'ERROR' });
        }
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
});