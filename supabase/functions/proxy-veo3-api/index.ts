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

// Gets a token, with an option to force a refresh from the backend
async function getVeo3Token(cookie, supabaseAdmin, taskId, forceRefresh = false) {
  const url = new URL('veo3/get_token', API_BASE_URL).toString();
  let responseData, errorForLog = null;
  
  const requestBody: { cookie: string; refresh?: boolean } = { cookie };
  if (forceRefresh) {
    requestBody.refresh = true;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    try { responseData = JSON.parse(responseText); } catch (e) { responseData = { raw_response: responseText }; }

    if (!response.ok) {
      throw new Error(`Failed to get Veo3 token: ${responseText}`);
    }
    
    if (!responseData.access_token) {
      throw new Error("Veo3 get_token response did not include access_token.");
    }
    
    return responseData.access_token;
  } catch (e) {
    errorForLog = e;
    throw e;
  } finally {
    const logPayload = { cookie: '[REDACTED]' };
    if (forceRefresh) {
      (logPayload as any).refresh = true;
    }
    await logApiCall(supabaseAdmin, taskId, `veo3/get_token (Internal, refresh=${forceRefresh})`, logPayload, responseData, errorForLog, url);
  }
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

  try {
    const body = await req.json();
    path = body.path;
    const payload = body.payload;
    const method = body.method || 'POST';
    taskId = body.taskId;
    let veo3_cookie = body.veo3_cookie;

    if (!veo3_cookie) {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) throw new Error("User not authenticated.");

        const settings = await getUserSettings(supabaseAdmin, user.id);
        veo3_cookie = settings.veo3_cookie;
    }

    const performApiCall = async (forceTokenRefresh = false) => {
        let finalPayload;
        const cookieEndpoints = ['veo3/re_promt'];

        if (cookieEndpoints.includes(path)) {
            finalPayload = { cookie: veo3_cookie, ...payload };
        } else {
            const accessToken = await getVeo3Token(veo3_cookie, supabaseAdmin, taskId, forceTokenRefresh);
            finalPayload = { token: accessToken, ...payload };
        }

        const targetUrl = new URL(path, API_BASE_URL).toString();

        const response = await fetch(targetUrl, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPayload),
        });
        
        let apiResponseData;
        const responseText = await response.text();
        try {
            apiResponseData = JSON.parse(responseText);
        } catch(e) {
            apiResponseData = { raw_response: responseText };
        }

        await logApiCall(supabaseAdmin, taskId, path, finalPayload, apiResponseData, response.ok ? null : new Error(responseText), targetUrl);

        return { response, responseData: apiResponseData };
    };

    // First attempt
    let { response, responseData } = await performApiCall(false);

    // Check for authentication error
    const isAuthError = !response.ok && JSON.stringify(responseData).includes("UNAUTHENTICATED");

    if (isAuthError) {
        console.log(`[proxy-veo3-api] INFO: Authentication error on first attempt for path ${path}. Retrying with forced token refresh.`);
        const retryResult = await performApiCall(true);
        response = retryResult.response;
        responseData = retryResult.responseData;
    }

    if (!response.ok) {
        throw new Error(`Lỗi từ API Veo3 (${response.status}): ${JSON.stringify(responseData)}`);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[proxy-veo3-api] FATAL ERROR:", error.message);
    // The error is already logged inside performApiCall, so we just re-throw to the client.
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});