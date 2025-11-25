// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE_URL = 'https://api.beautyapp.work';

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
  
  // First attempt
  let response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie }),
  });

  let responseText = await response.text();
  let responseData;
  try { responseData = JSON.parse(responseText); } catch (e) { /* ignore */ }

  // Check if refresh is needed and retry
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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { veo3_cookie } = await getUserSettings(supabaseAdmin, user.id);

    // --- Path Correction ---
    let correctedPath = path;
    if (path === 'veo3/generate') {
      correctedPath = 'video/veo3';
    } else if (path === 'veo3/image_uploadv2') {
      correctedPath = 'img/uploadmediav2';
    }
    console.log(`[proxy-veo3-api] INFO: Corrected path from '${path}' to '${correctedPath}'.`);
    // --- End Path Correction ---

    const targetUrl = new URL(correctedPath, API_BASE_URL).toString();
    
    let responseData;

    if (path === 'veo3/get_token') {
        const token = await getVeo3Token(veo3_cookie);
        responseData = { access_token: token, success: true };
    } else {
        const token = await getVeo3Token(veo3_cookie);
        const finalPayload = { token, ...payload };

        // Handle parameter name mismatch for image upload
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
        responseData = await response.json();
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