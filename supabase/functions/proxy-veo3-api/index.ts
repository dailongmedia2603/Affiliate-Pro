// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to get user settings
async function getUserSettings(supabaseAdmin, userId) {
  const { data: settings, error } = await supabaseAdmin
    .from('user_settings')
    .select('veo3_cookie, veo3_api_url')
    .eq('id', userId)
    .single();
  
  if (error) throw new Error(`Could not retrieve Veo3 settings for user: ${error.message}`);
  if (!settings?.veo3_cookie || !settings?.veo3_api_url) {
    throw new Error("Veo3 Cookie or API URL is not set in settings.");
  }
  return settings;
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

    const { veo3_cookie, veo3_api_url } = await getUserSettings(supabaseAdmin, user.id);

    // Construct the target URL safely
    const targetUrl = new URL(path, veo3_api_url).toString();
    console.log(`[proxy-veo3-api] INFO: Proxying request to ${targetUrl}`);

    // The API seems to require the cookie in the payload for some requests
    const finalPayload = {
      cookie: veo3_cookie,
      ...payload
    };

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