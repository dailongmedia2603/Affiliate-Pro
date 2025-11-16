// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { Buffer } from "https://deno.land/std@0.167.0/node/buffer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VOICE_API_BASE_URL = 'https://api.elevenlabs.io/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Xác thực người dùng qua Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError) throw userError

    // 2. Lấy API key từ bảng user_settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('voice_api_key')
      .eq('id', user.id)
      .single()

    if (settingsError || !settings || !settings.voice_api_key) {
      throw new Error('Không tìm thấy API Key cho dịch vụ Voice. Vui lòng kiểm tra lại cài đặt của bạn.')
    }
    const voiceApiKey = settings.voice_api_key;

    const { path, method = 'GET', payload, token: overrideToken } = await req.json()
    const apiKeyToUse = overrideToken || voiceApiKey;

    // Xử lý cho health-check và credits
    if (path === 'health-check') {
        const response = await fetch('https://api.minimax.chat/v1/text/chatcompletion_pro?GroupId=1', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKeyToUse}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "abab6-chat", tokens_to_generate: 10, messages: [{ sender_type: "USER", text: "hello" }] })
        });
        const data = await response.json();
        return new Response(JSON.stringify({ success: response.ok, data: { minimax: response.ok ? 'good' : 'bad', details: data } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    if (path === 'credits') {
        const response = await fetch('https://api.minimax.chat/v1/balance', {
            headers: { 'Authorization': `Bearer ${apiKeyToUse}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.base_resp?.status_msg || 'Failed to fetch credits');
        return new Response(JSON.stringify({ success: true, credits: data.available_balance }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Xử lý cho các request đến ElevenLabs
    const targetUrl = `${VOICE_API_BASE_URL}/${path}`;
    let response;

    if (method === 'POST' && path === 'voices/add') {
        // Handle voice cloning with multipart/form-data
        const formData = new FormData();
        formData.append('name', payload.name);
        payload.files.forEach(file => {
            const byteCharacters = atob(file.data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            formData.append('files', new Blob([byteArray]), file.name);
        });

        response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'xi-api-key': apiKeyToUse },
            body: formData,
        });

    } else {
        // Handle regular JSON requests
        const headers = {
            'Content-Type': 'application/json',
            'xi-api-key': apiKeyToUse,
        };

        const options = {
            method,
            headers,
            body: payload ? JSON.stringify(payload) : null,
        };

        response = await fetch(targetUrl, options);
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail?.message || `Lỗi API: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else if (contentType && contentType.includes('audio/mpeg')) {
        const audioBuffer = await response.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');
        return new Response(JSON.stringify({ audio_base64: audioBase64 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } else {
        const textData = await response.text();
        return new Response(textData, { headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})