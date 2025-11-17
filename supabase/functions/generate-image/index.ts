// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE = "https://api.beautyapp.work";

// Helper function to get a temporary token from Higgsfield API
async function getHiggsfieldToken(cookie, clerk_active_context) {
  console.log('[INFO] Attempting to get Higgsfield token...');
  const tokenResponse = await fetch(`${API_BASE}/gettoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie, clerk_active_context }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Lỗi khi lấy token từ Higgsfield: ${tokenResponse.status} - ${errorText}`);
  }

  const responseText = await tokenResponse.text();
  if (!responseText) {
    throw new Error('Không thể lấy token: API Higgsfield đã trả về phản hồi trống.');
  }

  let tokenData;
  try {
    tokenData = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Không thể lấy token: Phản hồi từ API Higgsfield không phải JSON. Phản hồi: ${responseText.slice(0, 200)}`);
  }

  if (!tokenData || !tokenData.jwt) {
    console.error('[ERROR] Failed to get JWT. API Response:', JSON.stringify(tokenData));
    throw new Error('Phản hồi từ Higgsfield không chứa token (jwt). Điều này có thể do Cookie hoặc Clerk Context không hợp lệ hoặc đã hết hạn.');
  }

  console.log('[INFO] Successfully retrieved Higgsfield token.');
  return tokenData.jwt;
}

serve(async (req) => {
  console.log('--- Image Function Request Received ---');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Authenticate user and get their settings
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError) throw userError;
    if (!user) throw new Error("User not authenticated.");

    const body = await req.json();
    // The 'action' property is no longer needed as this function only generates images.
    const { model, prompt, imageData, options } = body;
    console.log(`[INFO] User ${user.id} requested image generation`);

    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('higgsfield_cookie, higgsfield_clerk_context')
      .eq('id', user.id)
      .single()

    if (settingsError || !settings || !settings.higgsfield_cookie || !settings.higgsfield_clerk_context) {
      throw new Error('Không tìm thấy thông tin xác thực Higgsfield. Vui lòng kiểm tra lại cài đặt của bạn.')
    }
    const { higgsfield_cookie, higgsfield_clerk_context } = settings;
    
    const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);
    
    // --- GENERATION LOGIC ---
    if (!model || !prompt) {
        throw new Error("Model and prompt are required for generation.");
    }
    console.log(`[INFO] Starting image generation for model: ${model}`);

    // Upload image if provided
    let images_data = null;
    if (imageData) {
        console.log('[INFO] Uploading image for generation...');
        const uploadResponse = await fetch(`${API_BASE}/img/uploadmediav2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: token,
                cookie: higgsfield_cookie,
                clerk_active_context: higgsfield_clerk_context,
                url: [imageData],
                file_type: 'image'
            })
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Lỗi tải ảnh lên: ${errorText}`);
        }
        
        const uploadData = await uploadResponse.json();
        if (!uploadData || uploadData.success === false || !uploadData.data || uploadData.data.length === 0) {
            throw new Error(`Tải image lên thất bại. Phản hồi từ API không hợp lệ: ${JSON.stringify(uploadData)}`);
        }
        
        images_data = uploadData.data;
        console.log('[INFO] Image uploaded successfully.');
    }

    // Call the generation API
    let endpoint = '';
    let apiPayload = {};
    const basePayload = { token, prompt, images_data: images_data || [], ...options };

    switch (model) {
      case 'banana':
        endpoint = `${API_BASE}/img/banana`;
        apiPayload = { ...basePayload, batch_size: 1, aspect_ratio: "auto" };
        break;
      case 'seedream':
        endpoint = `${API_BASE}/img/seedream`;
        apiPayload = { ...basePayload, batch_size: 1, aspect_ratio: "1:1", quality: "basic" };
        break;
      default:
        throw new Error(`Model ảnh không được hỗ trợ: ${model}`);
    }

    console.log(`[INFO] Sending generation request to ${endpoint}`);
    const generationResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload)
    });

    if (!generationResponse.ok) {
      const errorText = await generationResponse.text();
      throw new Error(`Tạo ảnh thất bại: ${errorText}`);
    }

    const generationData = await generationResponse.json();
    console.log(`[INFO] API Generation Response:`, JSON.stringify(generationData, null, 2));
    if (!generationData.job_sets || generationData.job_sets.length === 0) {
        throw new Error('Phản hồi từ API tạo ảnh không hợp lệ.');
    }
    
    const newTaskId = generationData.job_sets[0].id;
    console.log(`[INFO] Successfully submitted image task. Higgsfield Task ID: ${newTaskId}`);

    return new Response(JSON.stringify({ success: true, taskId: newTaskId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('!!! [FATAL] An error occurred in the generate-image Edge Function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})