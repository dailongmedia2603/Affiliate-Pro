// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE = "https://api.beautyapp.work";

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

async function registerMediaUrl(token, mediaUrl) {
    if (!mediaUrl) return null;
    const uploadResponse = await fetch(`${API_BASE}/video/uploadmediav2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, url: [mediaUrl] })
    });
    const uploadData = await uploadResponse.json();
    if (!uploadData.status || !uploadData.data || uploadData.data.length === 0) {
        throw new Error(`Đăng ký media URL thất bại. Phản hồi API: ${JSON.stringify(uploadData)}`);
    }
    return uploadData.data;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error(userError?.message || "Không thể xác thực người dùng.");
    
    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('higgsfield_cookie, higgsfield_clerk_context')
      .eq('id', user.id)
      .single();

    if (settingsError || !settings || !settings.higgsfield_cookie || !settings.higgsfield_clerk_context) {
      throw new Error(`Không tìm thấy thông tin xác thực Higgsfield cho người dùng. Vui lòng kiểm tra lại Cài đặt.`);
    }
    const { higgsfield_cookie, higgsfield_clerk_context } = settings;
    const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);

    const { model, prompt, imageUrl, videoData, options } = await req.json();
    if (!model) throw new Error("Model is required.");

    const input_image = await registerMediaUrl(token, imageUrl);
    
    let endpoint = '';
    let apiPayload = {};
    const basePayload = { token, prompt, input_image, ...options };

    switch (model) {
        case 'kling':
            endpoint = `${API_BASE}/video/kling2.1`;
            apiPayload = { ...basePayload, model: "kling-v2-5-turbo", motion_id: "7077cde8-7947-46d6-aea2-dbf2ff9d441c" };
            break;
        case 'sora':
            endpoint = `${API_BASE}/video/sora`;
            apiPayload = { ...basePayload };
            break;
        case 'higg_life':
            endpoint = `${API_BASE}/video/higg_life`;
            apiPayload = { ...basePayload, motion_id:"d2389a9a-91c2-4276-bc9c-c9e35e8fb85a", model:"standard" };
            break;
        case 'wan2':
            throw new Error("Mô hình Wan2 chưa được hỗ trợ đầy đủ trong phiên bản này.");
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
    
    const taskId = generationData.job_sets[0].id;

    return new Response(JSON.stringify({ success: true, taskId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('!!! [LỖI] Đã xảy ra lỗi trong Edge Function (generate-video):', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
});