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
    console.log("[tao-video-sora] Function invoked.");

    // 1. Authenticate user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error(userError?.message || "Không thể xác thực người dùng.");
    console.log("[tao-video-sora] User authenticated:", user.id);
    
    // 2. Get user settings
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
    console.log("[tao-video-sora] Settings retrieved.");
    
    // 3. Get Higgsfield token
    const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);
    console.log("[tao-video-sora] Higgsfield token retrieved.");

    // 4. Process payload
    const { prompt, imageBase64, imageType, options } = await req.json();
    console.log("[tao-video-sora] Payload processed. Prompt length:", prompt?.length, "Has image:", !!imageBase64);

    let input_image = null;
    if (imageBase64) {
      console.log("[tao-video-sora] Registering media via base64 data...");
      const uploadPayload = {
        token: token,
        file_data: [imageBase64],
      };
      
      const uploadResponse = await fetch(`${API_BASE}/video/uploadmedia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadPayload)
      });

      console.log("[tao-video-sora] Media upload API response status:", uploadResponse.status);
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("[tao-video-sora] Media upload API error:", errorText);
        throw new Error(`Lỗi đăng ký media: ${errorText}`);
      }

      const uploadData = await uploadResponse.json();
      console.log("[tao-video-sora] Media upload API response data:", uploadData);

      if (uploadData?.status === true && uploadData.data) {
        input_image = uploadData.data;
        console.log("[tao-video-sora] Media registered successfully.");
      } else {
        throw new Error(`Đăng ký media thất bại: ${JSON.stringify(uploadData)}`);
      }
    }

    // 5. Call Sora API
    const endpoint = `${API_BASE}/video/sora`;
    const apiPayload = { token, prompt, input_image, ...options };
    console.log("[tao-video-sora] Calling Sora API with payload:", { ...apiPayload, token: 'REDACTED', input_image: input_image ? 'PRESENT' : 'ABSENT' });

    const generationResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload)
    });

    console.log("[tao-video-sora] Sora API response status:", generationResponse.status);

    if (!generationResponse.ok) {
      const errorText = await generationResponse.text();
      console.error("[tao-video-sora] Sora API error:", errorText);
      throw new Error(`Tạo video thất bại: ${errorText}`);
    }
    
    const generationData = await generationResponse.json();
    const taskId = generationData?.job_sets?.[0]?.id;
    console.log("[tao-video-sora] Task ID from API:", taskId);

    if (!taskId) {
      console.error("[tao-video-sora] No task ID in API response:", generationData);
      throw new Error('Không nhận được ID tác vụ từ API. Phản hồi: ' + JSON.stringify(generationData));
    }

    // 6. Return task ID
    console.log("[tao-video-sora] Returning success response with taskId:", taskId);
    return new Response(JSON.stringify({ success: true, taskId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('!!! [LỖI] Đã xảy ra lỗi trong Edge Function (tao-video-sora):', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
});