// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logApiCall = async (supabaseAdmin, taskId, userId, stepName, requestPayload, responseData, error = null, targetUrl = null) => {
  if (!userId) {
    console.error('[proxy-dream-act-api] logApiCall was called without a userId. Skipping log insertion.');
    return;
  }
  
  const sanitizedRequest = { ...requestPayload };
  if (sanitizedRequest.token) sanitizedRequest.token = '[REDACTED]';
  
  // Sanitize file objects for logging
  if (sanitizedRequest.photo) {
    if (sanitizedRequest.photo instanceof File) {
      sanitizedRequest.photo = `[FILE: ${sanitizedRequest.photo.name}, ${sanitizedRequest.photo.size} bytes]`;
    } else {
      sanitizedRequest.photo = '[INVALID_FILE_OBJECT]';
    }
  }
  if (sanitizedRequest.video) {
    if (sanitizedRequest.video instanceof File) {
      sanitizedRequest.video = `[FILE: ${sanitizedRequest.video.name}, ${sanitizedRequest.video.size} bytes]`;
    } else {
      sanitizedRequest.video = '[INVALID_FILE_OBJECT]';
    }
  }

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
    await supabaseAdmin.from('dream_act_logs').insert(logEntry);
  } catch(e) {
    console.error(`[proxy-dream-act-api] Failed to write log to DB: ${e.message}`);
  }
};


async function getUserSettings(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .select('dream_act_domain, dream_act_user_id, dream_act_client_id, dream_act_account_id, dream_act_token')
    .eq('id', userId)
    .single();
  if (error) throw new Error(`Could not retrieve Dream ACT settings: ${error.message}`);
  if (!data?.dream_act_domain || !data?.dream_act_token || !data?.dream_act_user_id || !data?.dream_act_client_id || !data?.dream_act_account_id) {
    throw new Error("Dream ACT API credentials are not fully configured in settings.");
  }
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  let taskId;
  let action;
  let requestPayloadForLog;
  let responseData;
  let errorForLog = null;
  let targetUrl;
  let userId;

  try {
    const contentType = req.headers.get("content-type")?.toLowerCase() || "";
    const isFormDataRequest = contentType.includes("multipart/form-data");
    
    let payload, file, body;

    if (isFormDataRequest) {
      const formData = await req.formData();
      action = formData.get('action');
      file = formData.get('file');
      taskId = formData.get('taskId');
      userId = formData.get('userId'); // Get userId from form data if available
      payload = {};

      if (file && typeof file === "string") {
        throw new Error("File is missing or invalid. Expected a file blob, but received a string.");
      }
    } else {
      body = await req.json();
      action = body.action;
      payload = body.payload;
      taskId = body.taskId;
      userId = body.userId; // Get userId from JSON body if available
    }

    if (!userId) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error("Authorization header is missing and no userId was provided in the body.");
      }
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !user) {
        throw new Error(userError?.message || "User not authenticated.");
      }
      userId = user.id;
    }

    const settings = await getUserSettings(supabaseAdmin, userId);
    
    const domain = settings.dream_act_domain.replace(/\/+$/, "");
    const { dream_act_domain, ...credentials } = settings;

    let targetPath = '';
    let method = 'POST';
    let bodyToSend;
    let headers = {
        'Accept': 'application/json, text/plain, */*',
    };

    const baseParams = {
      userId: credentials.dream_act_user_id,
      clientId: credentials.dream_act_client_id,
      accountId: credentials.dream_act_account_id,
      token: credentials.dream_act_token.trim(),
    };

    switch (action) {
      case 'upload_image':
        if (!file) throw new Error("A file is required for 'upload_image' action.");
        targetPath = '/oapi/composite/v3/private/common/mgmt/presignedUrl';
        method = 'POST';
        bodyToSend = new FormData();
        Object.entries(baseParams).forEach(([key, value]) => bodyToSend.append(key, value));
        bodyToSend.append('photo', file);
        requestPayloadForLog = { ...baseParams, photo: `[File: ${file.name}]` };
        break;
      case 'upload_video':
        if (!file) throw new Error("A file is required for 'upload_video' action.");
        targetPath = '/oapi/composite/v3/private/common/mgmt/presignedAct';
        method = 'POST';
        bodyToSend = new FormData();
        Object.entries(baseParams).forEach(([key, value]) => bodyToSend.append(key, value));
        bodyToSend.append('video', file);
        requestPayloadForLog = { ...baseParams, video: `[File: ${file.name}]` };
        break;
      case 'animate_video':
        if (!payload?.imageUrl || !payload?.videoUrl) {
            throw new Error("imageUrl and videoUrl are required for 'animate_video' action.");
        }
        targetPath = '/oapi/composite/v3/private/common/mgmt/animateVideo';
        method = 'POST';
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        bodyToSend = new URLSearchParams({ ...baseParams, ...payload }).toString();
        requestPayloadForLog = { ...baseParams, ...payload };
        break;
      case 'fetch_status':
        if (!payload?.animateId) {
          throw new Error("animateId is required for 'fetch_status' action.");
        }
        // Fallthrough intended
      case 'test_connection':
        const query = new URLSearchParams({
          ...baseParams,
          ...(payload || {}),
        }).toString();
        targetPath = `/oapi/composite/v3/private/common/mgmt/fetchRecentCreation?${query}`;
        method = 'GET';
        bodyToSend = undefined;
        requestPayloadForLog = { ...baseParams, ...(payload || {}) };
        break;
      case 'download_video':
         if (!payload?.workId) {
            throw new Error("workId is required for 'download_video' action.");
         }
         const downloadQuery = new URLSearchParams({
           ...baseParams,
           ...(payload || {}),
         }).toString();
         targetPath = `/oapi/composite/v3/private/common/mgmt/downloadVideo?${downloadQuery}`;
         method = 'GET';
         bodyToSend = undefined;
         requestPayloadForLog = { ...baseParams, ...(payload || {}) };
         break;
      default:
        throw new Error(`Invalid action: ${action}`);
    }

    if (!targetUrl) {
      targetUrl = `${domain}${targetPath}`;
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(targetUrl, { method, headers, body: bodyToSend, signal: controller.signal });
        clearTimeout(timeoutId);

        const responseText = await response.text();
        try {
            responseData = JSON.parse(responseText);
        } catch (e) {
            if (!response.ok) {
                throw new Error(`Dream ACT API Error (${response.status}): ${responseText.substring(0, 500)}`);
            }
            responseData = { raw_response: responseText };
        }

        if (!response.ok || (responseData.resultCode !== undefined && responseData.resultCode !== 0)) {
            throw new Error(responseData.message || `Dream ACT API Error: ${response.status}`);
        }
    } catch (e) {
        errorForLog = e;
        throw e;
    }

    await logApiCall(supabaseAdmin, taskId, userId, action, requestPayloadForLog, responseData, null, targetUrl);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[proxy-dream-act-api] FATAL ERROR:", error.message);
    await logApiCall(supabaseAdmin, taskId, userId, action, requestPayloadForLog, { error: error.message }, error, targetUrl);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});