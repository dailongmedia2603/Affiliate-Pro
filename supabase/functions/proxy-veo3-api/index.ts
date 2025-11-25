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

// Helper to get Veo3 token
async function getVeo3Token(cookie) {
  const url = new URL('veo3/get_token', API_BASE_URL).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Veo3 token: ${errorText}`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Veo3 get_token response did not include access_token.");
  }
  return data.access_token;
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
    // The client might send an old/incorrect path. We correct it here.
    let correctedPath = path;
    if (path === 'veo3/generate') {
      correctedPath = 'video/veo3';
      console.log(`[proxy-veo3-api] INFO: Corrected path from '${path}' to '${correctedPath}'.`);
    }
    // --- End Path Correction ---

    // Construct the target URL safely using the hardcoded base URL
    const targetUrl = new URL(correctedPath, API_BASE_URL).toString();
    console.log(`[proxy-veo3-api] INFO: Proxying request to ${targetUrl}`);

    let finalPayload;

    // For most endpoints, we need to get a token first and include it.
    // The get_token endpoint is an exception.
    if (path === 'veo3/get_token') {
        finalPayload = {
            cookie: veo3_cookie,
            ...payload
        };
    } else {
        const token = await getVeo3Token(veo3_cookie);
        finalPayload = {
            token: token,
            ...payload
        };
    }

    const response = await fetch(targetUrl, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[proxy-veo3-api] ERROR: External API returned non-OK status. Status: ${response.status}, Body: ${errorText}`);
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