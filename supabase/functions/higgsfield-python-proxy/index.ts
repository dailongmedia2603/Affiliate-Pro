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
    
    const { action, ...payload } = await req.json();
    const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);

    switch (action) {
      case 'test_connection': {
        return new Response(JSON.stringify({ success: true, message: 'Kết nối thành công!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      case 'generate_video': {
        const { model, prompt, imageUrls, videoData, options } = payload;
        if (!model) throw new Error("Model is required for video generation.");

        let input_image = null;
        if (imageUrls && imageUrls.length > 0) {
          const uploadPayload = { token, url: imageUrls, cookie: higgsfield_cookie, clerk_active_context: higgsfield_clerk_context };
          const uploadResponse = await fetch(`${API_BASE}/img/uploadmediav2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(uploadPayload)
          });
          if (!uploadResponse.ok) throw new Error(`Lỗi đăng ký media: ${await uploadResponse.text()}`);
          const uploadData = await uploadResponse.json();
          if (uploadData?.status === true && uploadData.data) {
            input_image = uploadData.data;
          } else {
            throw new Error(`Đăng ký media thất bại: ${JSON.stringify(uploadData)}`);
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
          case 'higg_life':
            endpoint = `${API_BASE}/video/higg_life`;
            apiPayload = { ...basePayload };
            break;
          case 'wan2':
            endpoint = `${API_BASE}/video/wan2`;
            apiPayload = { ...basePayload, video_data: videoData };
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
          throw new Error(`Tạo video thất bại: ${await generationResponse.text()}`);
        }
        
        const generationData = await generationResponse.json();
        const taskId = generationData?.job_sets?.[0]?.id;

        if (!taskId) {
          throw new Error('Không nhận được ID tác vụ từ API. Phản hồi: ' + JSON.stringify(generationData));
        }

        return new Response(JSON.stringify({ success: true, taskId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      default:
        throw new Error(`Hành động không hợp lệ hoặc không được hỗ trợ trong function này: ${action}`);
    }
  } catch (error) {
    console.error('!!! [LỖI] Đã xảy ra lỗi trong Edge Function (higgsfield-python-proxy):', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
});