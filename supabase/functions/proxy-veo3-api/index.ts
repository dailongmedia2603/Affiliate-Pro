// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE_URL = 'https://api.beautyapp.work';

const logApiCall = async (supabaseAdmin, taskId, stepName, requestPayload, responseData, error = null, targetUrl = null) => {
  if (!taskId) return;
  
  const sanitizedRequest = { ...requestPayload };
  if (sanitizedRequest.token) sanitizedRequest.token = '[REDACTED]';
  if (sanitizedRequest.cookie) sanitizedRequest.cookie = '[REDACTED]';
  if (sanitizedRequest.base64) sanitizedRequest.base64 = '[BASE64_DATA]';
  if (sanitizedRequest.file_data) sanitizedRequest.file_data = '[BASE64_DATA]';
  if (targetUrl) {
    sanitizedRequest._dyad_target_url = targetUrl;
  }

  const logEntry = {
    task_id: taskId,
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

// Helper to get user settings
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

// Helper to get Veo3 token, with refresh logic
async function getVeo3Token(cookie) {
  const url = new URL('veo3/get_token', API_BASE_URL).toString();
  
  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie }),
  });

  let responseText = await response.text();
  let responseData;
  try { responseData = JSON.parse(responseText); } catch (e) { /* ignore */ }

  if (!response.ok && responseData && responseData.error === 'ACCESS_TOKEN_REFRESH_NEEDED') {
    console.log('[proxy-veo3-api] INFO: Access token refresh needed. Retrying get_token with refresh flag.');
    
    response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie, refresh: true }),
    });
    responseText = await response.text();
  }

  if (!response.ok) {
    throw new Error(`Failed to get Veo3 token: ${responseText}`);
  }

  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    throw new Error(`Invalid JSON response from Veo3 get_token: ${responseText}`);
  }

  if (!responseData.access_token) {
    throw new Error("Veo3 get_token response did not include access_token.");
  }
  
  return responseData.access_token;
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  let taskId;
  let path;
  let requestPayloadForLog;
  let responseData;
  let errorForLog = null;
  let targetUrl;

  try {
    const body = await req.json();
    path = body.path;
    const payload = body.payload;
    const method = body.method || 'POST';
    taskId = body.taskId; // Extract taskId for logging

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    const { veo3_cookie } = await getUserSettings(supabaseAdmin, user.id);

    let correctedPath = path;
    // Logic to correct paths for different API versions or conventions
    if (path === 'veo3/image_uploadv2') {
      correctedPath = 'img/uploadmediav2';
    } else if (path === 'veo3/image_upload') {
      correctedPath = 'video/uploadmedia';
    }
    
    targetUrl = new URL(correctedPath, API_BASE_URL).toString();
    
    let finalPayload;
    const cookieEndpoints = ['veo3/re_promt', 'veo3/get_token'];

    if (cookieEndpoints.includes(path)) {
        finalPayload = { cookie: veo3_cookie, ...payload };
    } else {
        const token = await getVeo3Token(veo3_cookie);
        finalPayload = { token: token, ...payload };
    }

    if (path === 'veo3/image_uploadv2' && finalPayload.img_url) {
        finalPayload.url = finalPayload.img_url;
        delete finalPayload.img_url;
    }

    if (path === 'veo3/image_upload' && finalPayload.base64) {
        finalPayload.file_data = [finalPayload.base64];
        delete finalPayload.base64;
    }

    requestPayloadForLog = finalPayload;

    try {
        const response = await fetch(targetUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPayload),
        });
        
        const responseText = await response.text();
        try {
            responseData = JSON.parse(responseText);
        } catch(e) {
            responseData = { raw_response: responseText };
        }

        if (!response.ok) {
            throw new Error(`Lỗi từ API Veo3 (${response.status}): ${responseText}`);
        }
    } catch (e) {
        errorForLog = e;
        throw e;
    } finally {
        await logApiCall(supabaseAdmin, taskId, path, requestPayloadForLog, responseData, errorForLog, targetUrl);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[proxy-veo3-api] FATAL ERROR:", error.message);
    if (!errorForLog) {
        await logApiCall(supabaseAdmin, taskId, path, requestPayloadForLog, { error: error.message }, error, targetUrl);
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});