// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE_URL = 'https://api.beautyapp.work';

const logApiCall = async (supabaseAdmin, taskId, userId, stepName, requestPayload, responseData, error = null, targetUrl = null) => {
  if (!userId) {
    console.error('[proxy-veo3-api] logApiCall was called without a userId. Skipping log insertion.');
    return;
  }
  
  const sanitizedRequest = { ...requestPayload };
  if (sanitizedRequest.cookie) sanitizedRequest.cookie = '[REDACTED]';
  if (sanitizedRequest.token) sanitizedRequest.token = '[REDACTED]';
  if (sanitizedRequest.base64) sanitizedRequest.base64 = '[BASE64_DATA]';
  if (sanitizedRequest.file_data) sanitizedRequest.file_data = '[BASE64_DATA]';
  if (targetUrl) {
    sanitizedRequest._dyad_target_url = targetUrl;
  }

  const logEntry = {
    task_id: taskId,
    user_id: userId,
    step_name: stepName,
    request_payload: sanitizedRequest,
    response_data: responseData,
    is_error: !!error,
    error_message: error ? error.message : null,
  };
  try {
    await supabaseAdmin.from('veo3_logs').insert(logEntry);
  } catch(e) {
    console.error(`[proxy-veo3-api] Failed to write log to DB: ${e.message}`);
  }
};

async function getUserSettings(supabaseAdmin, userId) {
  const { data: settings, error } = await supabaseAdmin
    .from('user_settings')
    .select('veo3_cookie')
    .eq('id', userId)
    .single();
  
  if (error) throw new Error(`Could not retrieve Veo3 settings for user: ${error.message}`);
  if (!settings?.veo3_cookie) {
    throw new Error("Veo3 Cookie is not set in settings.");
  }
  return settings;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  let taskId, path, userId;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");
    userId = user.id;

    const body = await req.json();
    path = body.path;
    const payload = body.payload;
    const method = body.method || 'POST';
    taskId = body.taskId;
    let veo3_cookie = body.veo3_cookie;
    if (!veo3_cookie) {
        const settings = await getUserSettings(supabaseAdmin, userId);
        veo3_cookie = settings.veo3_cookie;
    }

    let requestPayload;
    const targetUrl = new URL(path, API_BASE_URL).toString();
    const cookieEndpoints = ['veo3/re_promt', 'veo3/get_token'];

    if (cookieEndpoints.includes(path)) {
        requestPayload = { cookie: veo3_cookie, ...payload };
    } else {
        const tokenUrl = new URL('veo3/get_token', API_BASE_URL).toString();
        const tokenRequestBody = { cookie: veo3_cookie };
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokenRequestBody),
        });
        const tokenResponseText = await tokenResponse.text();
        const tokenResponseData = JSON.parse(tokenResponseText);

        await logApiCall(supabaseAdmin, taskId, userId, 'veo3/get_token (Internal)', tokenRequestBody, tokenResponseData, tokenResponse.ok ? null : new Error(tokenResponseText), tokenUrl);

        if (!tokenResponse.ok || !tokenResponseData.access_token) {
            throw new Error(`Failed to get Veo3 token: ${tokenResponseText}`);
        }
        requestPayload = { token: tokenResponseData.access_token, ...payload };
    }

    const response = await fetch(targetUrl, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
    });

    const responseText = await response.text();
    const responseData = JSON.parse(responseText);

    await logApiCall(supabaseAdmin, taskId, userId, path, requestPayload, responseData, response.ok ? null : new Error(responseText), targetUrl);

    if (!response.ok) {
        const isAuthError = JSON.stringify(responseData).includes("UNAUTHENTICATED");
        if (isAuthError) {
            throw new Error(`Lỗi xác thực từ API Veo3. Có thể cookie đã hết hạn. (${response.status}): ${responseText}`);
        }
        throw new Error(`Lỗi từ API Veo3 (${response.status}): ${responseText}`);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[proxy-veo3-api] FATAL ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});