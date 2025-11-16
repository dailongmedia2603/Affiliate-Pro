// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

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
    const reqBody = await req.json()
    const { path, token, method = 'GET', body: payload } = reqBody

    if (!path || !token) {
      return new Response(JSON.stringify({ error: 'Thiếu các tham số bắt buộc: path hoặc token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetUrl = `${API_BASE_URL}/${path}`

    const fetchOptions = {
      method: method,
      headers: {
        'xi-api-key': token,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
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