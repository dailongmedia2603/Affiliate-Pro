// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log(`[INFO] Received request: ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    console.log('[INFO] Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { apiUrl, prompt, token: directToken } = await req.json()
    console.log(`[INFO] Processing request for apiUrl: ${apiUrl}`);

    if (!apiUrl || !prompt) {
      console.error('[ERROR] Missing required parameters: apiUrl or prompt');
      return new Response(JSON.stringify({ error: 'Thiếu các tham số bắt buộc: apiUrl hoặc prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let token = directToken;

    if (!token) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { data: settings, error: settingsError } = await supabaseAdmin
        .from('app_settings')
        .select('gemini_api_key')
        .limit(1)
        .single();
      
      if (settingsError || !settings?.gemini_api_key) {
        throw new Error("Chưa cấu hình Gemini API Key trong cài đặt toàn cục.");
      }
      token = settings.gemini_api_key;
    }

    const targetUrl = token ? `${apiUrl}?token=${encodeURIComponent(token)}` : apiUrl;

    const formData = new FormData();
    formData.append('prompt', prompt);

    console.log(`[INFO] Sending POST request to Gemini API proxy at ${targetUrl} with multipart/form-data.`);
    const response = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
    })

    const responseData = await response.text()
    console.log(`[INFO] Received response from Gemini API proxy. Status: ${response.status}`);

    if (!response.ok) {
      console.error(`[ERROR] Gemini API proxy returned an error. Status: ${response.status}, Body: ${responseData}`);
      throw new Error(`Lỗi từ API proxy: ${response.status} - ${responseData}`)
    }

    console.log('[INFO] Successfully proxied request to Gemini API.');
    return new Response(responseData, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('!!! [FATAL] An error occurred in the proxy-gemini-api function:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})