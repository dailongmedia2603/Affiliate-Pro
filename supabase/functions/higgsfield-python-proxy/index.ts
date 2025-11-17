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
    
    switch (action) {
      case 'test_connection': {
        await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);
        console.log('[INFO] Action: test_connection successful.');
        return new Response(JSON.stringify({ success: true, message: 'Kết nối thành công!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'generate_video': {
        const { model, prompt, imageData, videoData, options } = payload;
        console.log(`[INFO] Starting video generation for model: ${model}`);

        const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);

        const uploadMediaForVideo = async (mediaData) => {
            if (!mediaData) return null;
            console.log('[INFO] Uploading media for video generation...');
            const uploadResponse = await fetch("https://api.beautyapp.work/video/uploadmediav2", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, file_data: [mediaData] })
            });
            const uploadData = await uploadResponse.json();
            if (!uploadData.status || !uploadData.data || uploadData.data.length === 0) {
                console.error(`[ERROR] Media upload for video failed. API Response:`, JSON.stringify(uploadData));
                throw new Error(`Tải media cho video lên thất bại.`);
            }
            console.log('[INFO] Media uploaded successfully for video generation.');
            return uploadData.data;
        };

        if (model === 'wan2') {
            if (!imageData || !videoData) {
                throw new Error('Model Wan2 yêu cầu cả ảnh và video đầu vào.');
            }
            
            const uploadedImageData = await uploadMediaForVideo(imageData);
            const input_image = {
                id: uploadedImageData[0].id,
                url: uploadedImageData[0].url,
                type: "media_input"
            };

            const projectResponse = await fetch("https://api.beautyapp.work/video/video_project");
            const projectData = await projectResponse.json();
            const uploadUrl = projectData.upload_url;
            const videoId = projectData.id;
            
            const videoBuffer = Uint8Array.from(atob(videoData), (c) => c.charCodeAt(0));
            const videoUploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'video/mp4' },
                body: videoBuffer
            });
            if (!videoUploadResponse.ok) {
                throw new Error(`Tải video lên thất bại: ${videoUploadResponse.statusText}`);
            }

            const confirmResponse = await fetch("https://api.beautyapp.work/video/video_comfirm_ul", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: videoId })
            });
            const confirmData = await confirmResponse.json();
            const input_video = {
                id: videoId,
                url: uploadUrl,
                type: "video_input"
            };

            const wan2Payload = {
                token,
                flowId: "flow-animate-2025-09-21",
                type: options.type || "animate",
                model: "wan2_2_animate_mix",
                prompt: prompt || "",
                resolution: "480p",
                input_image,
                input_video,
                height: confirmData.height,
                width: confirmData.width,
                mode: "move"
            };

            const generationResponse = await fetch("https://api.beautyapp.work/video/wan2", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wan2Payload)
            });
            
            if (!generationResponse.ok) {
                const errorText = await generationResponse.text();
                throw new Error(`Tạo video Wan2 thất bại: ${errorText}`);
            }
            const generationData = await generationResponse.json();
            if (!generationData.job_sets || generationData.job_sets.length === 0) {
                throw new Error('Phản hồi từ API Wan2 không hợp lệ.');
            }
            const newTaskId = generationData.job_sets[0].id;
            console.log(`[INFO] Successfully submitted video task (wan2). Higgsfield Task ID: ${newTaskId}`);
            return new Response(JSON.stringify({ success: true, taskId: newTaskId }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

        } else {
            const input_image = await uploadMediaForVideo(imageData);
            
            let endpoint = '';
            let apiPayload = {};
            const basePayload = { token, prompt, input_image, ...options };

            switch (model) {
                case 'kling':
                    endpoint = 'https://api.beautyapp.work/video/kling2.1';
                    apiPayload = { ...basePayload, model: "kling-v2-5-turbo" };
                    break;
                case 'sora':
                    endpoint = 'https://api.beautyapp.work/video/sora';
                    apiPayload = basePayload;
                    break;
                case 'higg_life':
                    endpoint = 'https://api.beautyapp.work/video/higg_life';
                    apiPayload = { ...basePayload, model: "standard" };
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