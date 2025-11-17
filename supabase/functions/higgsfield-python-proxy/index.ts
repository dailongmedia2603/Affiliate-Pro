// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HIGGSFIELD_TOKEN_URL = 'https://api.beautyapp.work/gettoken';

// Helper function to get a temporary token
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
  if (!tokenData.jwt) {
    throw new Error('Phản hồi từ Higgsfield không chứa token (jwt).');
  }
  return tokenData.jwt;
}

serve(async (req) => {
  console.log('--- New Request Received ---');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError) throw userError

    const { action, ...payload } = await req.json()
    console.log(`[INFO] Request from user: ${user.id}, Action: ${action}`);

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

    switch (action) {
      case 'test_connection': {
        console.log('[INFO] Action: test_connection successful.');
        return new Response(JSON.stringify({ success: true, message: 'Kết nối thành công!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'generate_image': {
        const { model, prompt, imageData, options } = payload;
        console.log(`[INFO] Starting image generation for model: ${model}`);
        
        let images_data = [];
        if (imageData) {
          const uploadResponse = await fetch("https://api.beautyapp.work/img/uploadmedia", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, url: imageData })
          });
          const uploadData = await uploadResponse.json();
          if (uploadData.success === false || !uploadData.data || uploadData.data.length === 0) {
            console.error('[ERROR] Image upload failed. API Response:', JSON.stringify(uploadData));
            throw new Error('Tải ảnh lên thất bại. Chi tiết đã được ghi lại trong log.');
          }
          images_data = uploadData.data;
        }

        let endpoint = '';
        let apiPayload = {};
        const basePayload = { token, prompt, images_data: images_data, ...options };

        switch (model) {
          case 'banana':
            endpoint = 'https://api.beautyapp.work/img/banana';
            apiPayload = { ...basePayload, batch_size: 1, aspect_ratio: "auto" };
            break;
          case 'seedream':
            endpoint = 'https://api.beautyapp.work/img/seedream';
            apiPayload = { ...basePayload, batch_size: 1, aspect_ratio: "1:1", quality: "basic" };
            break;
          default:
            throw new Error(`Model ảnh không được hỗ trợ: ${model}`);
        }

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
        if (!generationData.job_sets || generationData.job_sets.length === 0) {
            throw new Error('Phản hồi từ API tạo ảnh không hợp lệ.');
        }
        
        const newTaskId = generationData.job_sets[0].id;
        console.log(`[INFO] Successfully submitted image task. Higgsfield Task ID: ${newTaskId}`);
        return new Response(JSON.stringify({ success: true, taskId: newTaskId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'generate_video': {
        const { model, prompt, imageData, videoData, options } = payload;
        console.log(`[INFO] Starting video generation for model: ${model}`);

        // Upload image if provided
        let images_data = [];
        if (imageData) {
          const uploadResponse = await fetch("https://api.beautyapp.work/img/uploadmedia", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, url: imageData })
          });
          const uploadData = await uploadResponse.json();
          if (uploadData.success === false || !uploadData.data || uploadData.data.length === 0) {
            console.error('[ERROR] Image upload failed. API Response:', JSON.stringify(uploadData));
            throw new Error('Tải ảnh lên thất bại. Chi tiết đã được ghi lại trong log.');
          }
          images_data = uploadData.data;
        }

        // Upload video if provided (for wan2)
        let videos_data = [];
        if (videoData) {
          const uploadResponse = await fetch("https://api.beautyapp.work/img/uploadmedia", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, url: videoData, file_type: 'video' })
          });
          const uploadData = await uploadResponse.json();
          if (uploadData.success === false || !uploadData.data || uploadData.data.length === 0) {
            console.error('[ERROR] Video upload failed. API Response:', JSON.stringify(uploadData));
            throw new Error('Tải video lên thất bại. Chi tiết đã được ghi lại trong log.');
          }
          videos_data = uploadData.data;
        }

        let endpoint = '';
        let apiPayload = {};
        
        switch (model) {
          case 'kling':
            endpoint = 'https://api.beautyapp.work/video/kling';
            apiPayload = { token, prompt, images_data, ...options };
            break;
          case 'sora':
            endpoint = 'https://api.beautyapp.work/video/sora';
            apiPayload = { token, prompt, images_data, ...options };
            break;
          case 'higg_life':
            endpoint = 'https://api.beautyapp.work/video/higg_life';
            apiPayload = { token, prompt, images_data, ...options };
            break;
          case 'wan2':
            endpoint = 'https://api.beautyapp.work/video/wan2';
            if (images_data.length === 0 || videos_data.length === 0) {
              throw new Error('Model Wan2 yêu cầu cả ảnh và video đầu vào.');
            }
            apiPayload = { token, prompt, images_data, videos_data, ...options };
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
        console.log(`[INFO] Successfully submitted video task (${model}). Higgsfield Task ID: ${newTaskId}`);
        return new Response(JSON.stringify({ success: true, taskId: newTaskId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_task_status': {
        const { taskId } = payload;
        console.log(`[INFO] Checking status for Task ID: ${taskId}`);
        
        const statusResponse = await fetch("https://api.beautyapp.work/status", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, taskid: taskId })
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`[ERROR] Failed to get task status for ${taskId}. API response: ${statusResponse.status} - ${errorText}`);
          throw new Error(`Không thể lấy trạng thái tác vụ. API trả về: ${statusResponse.status}`);
        }
        
        const responseText = await statusResponse.text();
        let statusData;
        try {
          statusData = JSON.parse(responseText);
        } catch (e) {
          console.error(`[ERROR] Failed to parse JSON response for task ${taskId}. Raw response: ${responseText}`);
          throw new Error('Phản hồi từ API trạng thái không phải là JSON hợp lệ.');
        }

        console.log(`[INFO] Raw status response for ${taskId}:`, responseText);
        
        const status = statusData?.jobs?.[0]?.status;
        console.log(`[INFO] Parsed status for ${taskId}: ${status || 'N/A'}`);

        return new Response(JSON.stringify(statusData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Hành động không hợp lệ: ${action}`)
    }
  } catch (error) {
    console.error('!!! [FATAL] An error occurred in the Edge Function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})