// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE_URL = 'https://api.beautyapp.work';

async function getGlobalSettings(supabaseAdmin) {
  const { data: settings, error } = await supabaseAdmin
    .from('app_settings')
    .select('veo3_cookie')
    .limit(1)
    .single();
  
  if (error) throw new Error(`Could not retrieve Veo3 settings from global settings: ${error.message}`);
  if (!settings?.veo3_cookie) {
    throw new Error("Veo3 Cookie is not set in global settings.");
  }
  return settings;
}

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

  try {
    const { path, payload, method = 'POST' } = await req.json();
    if (!path) throw new Error("Path is required.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { veo3_cookie } = await getGlobalSettings(supabaseAdmin);

    let correctedPath = path;
    if (path === 'veo3/generate') {
      correctedPath = 'video/veo3';
    } else if (path === 'veo3/image_uploadv2') {
      correctedPath = 'img/uploadmediav2';
    }
    console.log(`[proxy-veo3-api] INFO: Corrected path from '${path}' to '${correctedPath}'.`);

    const targetUrl = new URL(correctedPath, API_BASE_URL).toString();
    
    let finalPayload;
    const cookieEndpoints = ['veo3/re_promt'];

    if (cookieEndpoints.includes(path)) {
        console.log(`[proxy-veo3-api] INFO: Path '${path}' uses cookie directly.`);
        finalPayload = {
            cookie: veo3_cookie,
            ...payload
        };
    } else {
        console.log(`[proxy-veo3-api] INFO: Path '${path}' requires a token. Fetching token...`);
        const token = await getVeo3Token(veo3_cookie);
        finalPayload = {
            token: token,
            ...payload
        };
    }

    if (path === 'veo3/image_uploadv2' && finalPayload.img_url) {
        console.log('[proxy-veo3-api] INFO: Renaming "img_url" to "url" for compatibility.');
        finalPayload.url = finalPayload.img_url;
        delete finalPayload.img_url;
    }

    const response = await fetch(targetUrl, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Lỗi từ API Veo3 (${response.status}): ${errorText}`);
    }
    const responseData = await response.json();

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