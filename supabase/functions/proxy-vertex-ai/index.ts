// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Sử dụng endpoint của Google AI Gemini API, model này tương đương gemini 1.5 pro trên Vertex AI
const GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw userError;

    // Chỉ cần lấy vertex_ai_api_key, không cần gcp_project_id
    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('vertex_ai_api_key')
      .eq('id', user.id)
      .single();

    if (settingsError || !settings || !settings.vertex_ai_api_key) {
      throw new Error('Không tìm thấy Vertex AI API Key. Vui lòng kiểm tra lại cài đặt.');
    }
    
    const { vertex_ai_api_key } = settings;
    const { prompt } = await req.json();
    if (!prompt) {
      throw new Error('Thiếu tham số bắt buộc: prompt');
    }

    const requestUrl = `${GOOGLE_API_URL}?key=${vertex_ai_api_key}`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[ERROR] Google Gemini API returned an error. Status: ${response.status}, Body: ${responseText}`);
      try {
        const errorJson = JSON.parse(responseText);
        const errorMessage = errorJson?.error?.message || responseText;
        throw new Error(`Lỗi từ API Gemini: ${response.status} - ${errorMessage}`);
      } catch (e) {
        throw new Error(`Lỗi từ API Gemini: ${response.status} - ${responseText}`);
      }
    }

    const responseJson = JSON.parse(responseText);
    const generatedText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (generatedText === undefined) {
      console.error('[ERROR] Could not parse generated text from Gemini API response. Body:', responseText);
      throw new Error('Không thể phân tích phản hồi từ API Gemini.');
    }

    return new Response(JSON.stringify({ success: true, data: generatedText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('!!! [FATAL] An error occurred in the proxy-vertex-ai function:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})