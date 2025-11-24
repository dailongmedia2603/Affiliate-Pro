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

// Helper to get Veo3 token
async function getVeo3Token(apiUrl, cookie) {
  const response = await fetch(`${apiUrl}/veo3/get_token`, {
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
    const { action, payload } = await req.json();
    if (!action) throw new Error("Action is required.");

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

    let responseData;

    switch (action) {
      case 'test_connection': {
        const token = await getVeo3Token(veo3_api_url, veo3_cookie);
        responseData = { success: true, message: 'Connection successful.', token_preview: token.substring(0, 10) + '...' };
        break;
      }
      
      // Other actions can be added here as needed

      default:
        throw new Error(`Invalid action: ${action}`);
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