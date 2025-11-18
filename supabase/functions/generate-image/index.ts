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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    const { action, stepId, ...payload } = await req.json();

    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('higgsfield_cookie, higgsfield_clerk_context')
      .eq('id', user.id)
      .single();

    if (settingsError || !settings || !settings.higgsfield_cookie || !settings.higgsfield_clerk_context) {
      throw new Error('Không tìm thấy thông tin xác thực Higgsfield. Vui lòng kiểm tra lại cài đặt của bạn.');
    }
    const { higgsfield_cookie, higgsfield_clerk_context } = settings;
    const token = await getHiggsfieldToken(higgsfield_cookie, higgsfield_clerk_context);

    if (action === 'generate_image') {
      const { model, prompt, image_urls, aspect_ratio } = payload;
      if (!model || !prompt) throw new Error("Model and prompt are required.");
      if (model !== 'banana') throw new Error(`Model ảnh không được hỗ trợ: ${model}`);

      let images_data = [];
      if (image_urls && image_urls.length > 0) {
        const uploadPayload = {
          token,
          url: image_urls,
          cookie: higgsfield_cookie,
          clerk_active_context: higgsfield_clerk_context,
        };
        const uploadResponse = await fetch(`${API_BASE}/img/uploadmediav2`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(uploadPayload)
        });
        if (!uploadResponse.ok) throw new Error(`Lỗi đăng ký media: ${await uploadResponse.text()}`);
        const uploadData = await uploadResponse.json();
        if (uploadData && uploadData.status === true && uploadData.data) {
          images_data = uploadData.data;
        } else {
          throw new Error(`Đăng ký media thất bại: ${JSON.stringify(uploadData)}`);
        }
      }

      let logId;
      let logTable;
      let logIdField;

      if (stepId) {
        // This is part of an automation run
        logTable = 'automation_run_steps';
        logIdField = 'id';
        logId = stepId;
        // Update the existing step to 'running'
        const { error: updateError } = await supabaseAdmin
          .from(logTable)
          .update({ status: 'running' })
          .eq(logIdField, logId);
        if (updateError) throw updateError;
      } else {
        // This is a standalone generation
        logTable = 'higgsfield_generation_logs';
        logIdField = 'id';
        const { data: log, error: logError } = await supabaseAdmin
          .from(logTable)
          .insert({ user_id: user.id, model, prompt, status: 'processing' })
          .select(logIdField)
          .single();
        if (logError) throw logError;
        logId = log[logIdField];
      }

      const endpoint = `${API_BASE}/img/banana`;
      const basePayload = { token, prompt, images_data, width: 1024, height: 1024, aspect_ratio };
      const apiPayload = { ...basePayload, batch_size: 1 };

      const generationResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload)
      });
      if (!generationResponse.ok) throw new Error(`Tạo ảnh thất bại: ${await generationResponse.text()}`);
      const generationData = await generationResponse.json();
      if (!generationData.job_sets || generationData.job_sets.length === 0) {
        throw new Error('Phản hồi từ API tạo ảnh không hợp lệ.');
      }
      const api_task_id = generationData.job_sets[0].id;

      // Update the log/step with the API task ID
      const { error: updateError } = await supabaseAdmin
        .from(logTable)
        .update({ api_task_id: api_task_id, status: 'running' })
        .eq(logIdField, logId);
      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true, logId: logId, taskId: api_task_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error(`Hành động không hợp lệ: ${action}`);
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});