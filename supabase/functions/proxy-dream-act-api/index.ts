// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

  try {
    // Create a Supabase client with the Auth context of the logged-in user.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error("Missing Authorization header.");
    }
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Now we can get the user object
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("Authentication error:", userError?.message);
      throw new Error("User not authenticated.");
    }
    const userId = user.id;

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const settings = await getUserSettings(supabaseAdmin, userId);
    const { dream_act_domain, ...credentials } = settings;

    const isFormDataRequest = req.headers.get('content-type')?.includes('multipart/form-data');
    let action, payload, file;

    if (isFormDataRequest) {
      const formData = await req.formData();
      action = formData.get('action');
      file = formData.get('file');
      payload = {};
    } else {
      const body = await req.json();
      action = body.action;
      payload = body.payload;
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
        break;
      case 'upload_video':
        targetPath = '/oapi/composite/v3/private/common/mgmt/presignedAct';
        bodyToSend = new FormData();
        Object.entries(baseParams).forEach(([key, value]) => bodyToSend.append(key, value));
        bodyToSend.append('video', file);
        break;
      case 'animate_video':
        targetPath = '/oapi/composite/v3/private/common/mgmt/animateVideo';
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        bodyToSend = new URLSearchParams({ ...baseParams, ...payload }).toString();
        break;
      case 'fetch_status':
        targetPath = '/oapi/composite/v3/private/common/mgmt/fetchRecentCreation';
        method = 'GET';
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        bodyToSend = new URLSearchParams({ ...baseParams, ...payload }).toString();
        targetPath += `?${bodyToSend}`;
        bodyToSend = undefined;
        break;
      case 'download_video':
         targetPath = '/oapi/composite/v3/private/common/mgmt/downloadVideo';
         method = 'PATCH';
         headers['Content-Type'] = 'application/x-www-form-urlencoded';
         bodyToSend = new URLSearchParams({ ...baseParams, ...payload }).toString();
         break;
      case 'test_connection':
        targetPath = '/oapi/composite/v3/private/common/mgmt/fetchRecentCreation';
        method = 'GET';
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        const testParams = new URLSearchParams({ ...baseParams, pageSize: 1 }).toString();
        targetPath += `?${testParams}`;
        bodyToSend = undefined;
        break;
      default:
        throw new Error(`Invalid action: ${action}`);
    }

    const targetUrl = `${dream_act_domain}${targetPath}`;
    const response = await fetch(targetUrl, { method, headers, body: bodyToSend });
    const responseData = await response.json();

    if (!response.ok || responseData.resultCode !== 0) {
      throw new Error(responseData.message || `Dream ACT API Error: ${response.status}`);
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[proxy-dream-act-api] FATAL ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});