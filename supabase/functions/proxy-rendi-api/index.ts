// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE_URL = 'https://api.rendi.dev/v1';

serve(async (req) => {
  console.log(`[proxy-rendi-api] INFO: Received request: ${req.method} ${req.url}`);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authenticate user and get Rendi API key from settings
    console.log("[proxy-rendi-api] INFO: Authenticating user...");
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");
    console.log("[proxy-rendi-api] INFO: User authenticated successfully. User ID:", user.id);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('rendi_api_key')
      .eq('id', user.id)
      .single();

    const rendiApiKey = settings?.rendi_api_key;
    if (!rendiApiKey) {
      console.error("[proxy-rendi-api] ERROR: Rendi API key not found for user.");
      return new Response(JSON.stringify({ error: 'Rendi API key is not set in user settings.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.log("[proxy-rendi-api] INFO: Rendi API key retrieved.");

    // 2. Process the incoming request from the frontend
    const { action, payload } = await req.json();
    console.log(`[proxy-rendi-api] INFO: Action: '${action}'.`);
    let url = '';
    let options: RequestInit = {
      headers: {
        'X-API-KEY': rendiApiKey,
        'Content-Type': 'application/json',
      },
    };

    // 3. Determine the target Rendi API endpoint and method based on the action
    switch (action) {
      case 'test_connection':
        url = `${API_BASE_URL}/commands?limit=1`;
        options.method = 'GET';
        break;
      case 'run_command':
        url = `${API_BASE_URL}/run-ffmpeg-command`;
        options.method = 'POST';
        options.body = JSON.stringify(payload);
        break;
      case 'run_chained_commands':
        url = `${API_BASE_URL}/run-chained-ffmpeg-commands`;
        options.method = 'POST';
        options.body = JSON.stringify(payload);
        break;
      case 'check_status':
        if (!payload.command_id) throw new Error("command_id is required for check_status action.");
        url = `${API_BASE_URL}/commands/${payload.command_id}`;
        options.method = 'GET';
        break;
      default:
        throw new Error(`Invalid action: ${action}`);
    }
    console.log(`[proxy-rendi-api] INFO: Forwarding request to Rendi API: ${options.method} ${url}`);

    // 4. Forward the request to the Rendi API
    const response = await fetch(url, options);
    const responseText = await response.text();
    console.log(`[proxy-rendi-api] INFO: Received response from Rendi API. Status: ${response.status}`);

    // 5. Return the response from Rendi API back to the frontend
    let data;
    try {
      data = JSON.parse(responseText);
    } catch(e) {
      console.error("[proxy-rendi-api] ERROR: Failed to parse JSON response from Rendi API. Response text:", responseText);
      throw new Error(`Invalid JSON response from Rendi API: ${responseText}`);
    }

    if (!response.ok) {
      const errorMessage = data.detail || `Rendi API Error: ${response.status}`;
      console.error("[proxy-rendi-api] ERROR: Rendi API returned an error.", errorMessage);
      return new Response(JSON.stringify({ error: errorMessage }), { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log("[proxy-rendi-api] INFO: Successfully processed request. Returning response to client.");
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    });

  } catch (error) {
    console.error("[proxy-rendi-api] FATAL ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});