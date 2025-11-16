// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE_URL = 'https://api.elevenlabs.io/v1'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Xác thực người dùng và tạo Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError) throw userError

    // 2. Lấy API key của người dùng từ database
    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('voice_api_key')
      .eq('id', user.id)
      .single()

    if (settingsError || !settings || !settings.voice_api_key) {
      throw new Error('Không tìm thấy API Key cho Voice. Vui lòng kiểm tra lại cài đặt của bạn.')
    }
    const token = settings.voice_api_key;

    // 3. Xử lý request từ client
    const reqBody = await req.json()
    const { path, method = 'GET', body: payload } = reqBody

    if (!path) {
      return new Response(JSON.stringify({ error: 'Thiếu tham số bắt buộc: path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetUrl = `${API_BASE_URL}/${path}`
    
    const acceptHeader = path.startsWith('text-to-speech') ? 'audio/mpeg' : 'application/json';

    const fetchOptions = {
      method: method,
      headers: {
        'xi-api-key': token, // Sử dụng key lấy từ database
        'Content-Type': 'application/json',
        'Accept': acceptHeader,
      },
    }

    if (method === 'POST' && payload) {
      fetchOptions.body = JSON.stringify(payload)
    }

    const response = await fetch(targetUrl, fetchOptions)

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch (e) {
        errorBody = await response.text();
      }
      console.error('Upstream API Error:', errorBody);
      return new Response(JSON.stringify({ error: `Lỗi API: ${response.status}`, details: errorBody }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      const responseData = await response.json();
      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    if (contentType && contentType.includes('audio/mpeg')) {
      return new Response(response.body, {
        headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' },
      });
    }

    const responseData = await response.text();
    return new Response(responseData, {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    })

  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})