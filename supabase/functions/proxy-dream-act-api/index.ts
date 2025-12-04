// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logApiCall = async (supabaseAdmin, taskId, stepName, requestPayload, responseData, error = null, targetUrl = null) => {
  if (!taskId) return;
  
  const sanitizedRequest = { ...requestPayload };
  if (sanitizedRequest.token) sanitizedRequest.token = '[REDACTED]';
  if (sanitizedRequest.photo) sanitizedRequest.photo = `[FILE: ${sanitizedRequest.photo.name}, ${sanitizedRequest.photo.type}]`;
  if (sanitizedRequest.video) sanitizedRequest.video = `[FILE: ${sanitizedRequest.video.name}, ${sanitizedRequest.video.type}]`;
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
  await supabaseAdmin.from('dream_act_logs').insert(logEntry);
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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Authorization header is missing.");
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
    const userId = user.id;

    const settings = await getUserSettings(supabaseAdmin, userId);
    const { dream_act_domain, ...credentials } = settings;

    const isFormDataRequest = req.headers.get('content-type')?.includes('multipart/form-data');
    let payload, file;

    if (isFormDataRequest) {
      const formData = await req.formData();
      action = formData.get('action');
      file = formData.get('file');
      taskId = formData.get('taskId');
      payload = {};
    } else {
      const body = await req.json();
      action = body.action;
      payload = body.payload;
      taskId = body.taskId;
    }

    let targetPath = '';
    let method = 'POST';
    let bodyToSend;
    let headers = {};

    const baseParams = {
      userId: credentials.dream_act_user_id,
      clientId: credentials.dream_act_client_id,
      accountId: credentials.dream_act_account_id,
      token: credentials.dream_act_token,
    };

    switch (action) {
      case 'upload_image':
        targetPath = '/oapi/composite/v3/private/common/mgmt/presignedUrl';
        bodyToSend = new FormData();
        Object.entries(baseParams).forEach(([key, value]) => bodyToSend.append(key, value));
        bodyToSend.append('photo', file);
        requestPayloadForLog = { ...baseParams, photo: file };
        break;
      case 'upload_video':
        targetPath = '/oapi/composite/v3/private/common/mgmt/presignedAct';
        bodyToSend = new FormData();
        Object.entries(baseParams).forEach(([key, value]) => bodyToSend.append(key, value));
        bodyToSend.append('video', file);
        requestPayloadForLog = { ...baseParams, video: file };
        break;
      case 'animate_video':
        targetPath = '/oapi/composite/v3/private/common/mgmt/animateVideo';
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        
        const params = new URLSearchParams();
        params.append('userId', baseParams.userId);
        params.append('clientId', baseParams.clientId);
        params.append('accountId', baseParams.accountId);
        params.append('token', baseParams.token);
        params.append('imageUrl', payload.imageUrl);
        params.append('videoUrl', payload.videoUrl);

        bodyToSend = params.toString();
        
        requestPayloadForLog = {
            userId: baseParams.userId,
            clientId: baseParams.clientId,
            accountId: baseParams.accountId,
            token: baseParams.token,
            imageUrl: payload.imageUrl,
            videoUrl: payload.videoUrl,
        };
        break;
      case 'fetch_status':
        targetPath = '/oapi/composite/v3/private/common/mgmt/fetchRecentCreation';
        method = 'POST';
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        bodyToSend = new URLSearchParams({ ...baseParams, ...payload }).toString();
        requestPayloadForLog = { ...baseParams, ...payload };
        break;
      case 'download_video':
         targetPath = '/oapi/composite/v3/private/common/mgmt/downloadVideo';
         method = 'PATCH';
         headers['Content-Type'] = 'application/x-www-form-urlencoded';
         bodyToSend = new URLSearchParams({ ...baseParams, ...payload }).toString();
         requestPayloadForLog = { ...baseParams, ...payload };
         break;
      case 'test_connection':
        targetPath = '/oapi/composite/v3/private/common/mgmt/fetchRecentCreation';
        method = 'POST';
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        bodyToSend = new URLSearchParams({ ...baseParams, pageSize: 1 }).toString();
        requestPayloadForLog = { ...baseParams, pageSize: 1 };
        break;
      default:
        throw new Error(`Invalid action: ${action}`);
    }

    targetUrl = `${dream_act_domain}${targetPath}`;
    
    try {
        const response = await fetch(targetUrl, { method, headers, body: bodyToSend });
        responseData = await response.json();

        if (!response.ok || responseData.resultCode !== 0) {
          throw new Error(responseData.message || `Dream ACT API Error: ${response.status}`);
        }
    } catch (e) {
        errorForLog = e;
        throw e;
    } finally {
        await logApiCall(supabaseAdmin, taskId, action, requestPayloadForLog, responseData, errorForLog, targetUrl);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[proxy-dream-act-api] FATAL ERROR:", error.message);
    await logApiCall(supabaseAdmin, taskId, action, requestPayloadForLog, responseData, error, targetUrl);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});