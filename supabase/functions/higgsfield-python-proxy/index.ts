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
        return new Response(JSON.stringify({ success: true, message: 'Kết nối thành công!' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'generate_video': {
        const { model, prompt, imageData, options } = payload;
        const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);

        let input_image = null;
        if (imageData) {
          const uploadResponse = await fetch("https://api.beautyapp.work/video/uploadmedia", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, file_data: [imageData] })
          });
          const uploadData = await uploadResponse.json();
          if (!uploadData.status || !uploadData.data || uploadData.data.length === 0) {
            throw new Error('Tải ảnh lên thất bại.');
          }
          input_image = uploadData.data;
        }

        let endpoint = '';
        let apiPayload = {};
        const basePayload = { token, prompt, input_image, ...options };

        switch (model) {
          case 'kling':
            endpoint = 'https://api.beautyapp.work/video/kling2.1';
            apiPayload = { ...basePayload, model: "kling-v2-5-turbo", ...options };
            break;
          case 'sora':
            endpoint = 'https://api.beautyapp.work/video/sora';
            apiPayload = basePayload;
            break;
          case 'higg_life':
            endpoint = 'https://api.beautyapp.work/video/higg_life';
            apiPayload = { ...basePayload, model: "standard", ...options };
            break;
          default:
            throw new Error(`Model không được hỗ trợ: ${model}`);
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
            throw new Error('Phản hồi từ API không hợp lệ.');
        }

        return new Response(JSON.stringify({ success: true, taskId: generationData.job_sets[0].id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_task_status': {
        const { taskId } = payload;
        const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);
        
        const statusResponse = await fetch("https://api.beautyapp.work/status", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, taskid: taskId })
        });

        if (!statusResponse.ok) {
          throw new Error('Không thể lấy trạng thái tác vụ.');
        }
        
        const statusData = await statusResponse.json();
        return new Response(JSON.stringify(statusData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Hành động không hợp lệ: ${action}`)
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})