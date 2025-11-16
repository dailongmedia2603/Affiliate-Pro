// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE_URL = 'https://gateway.vivoo.work/v1'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { path, token } = await req.json()

    if (!path || !token) {
      return new Response(JSON.stringify({ error: 'Thiếu các tham số bắt buộc: path hoặc token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetUrl = `${API_BASE_URL}/${path}`

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'xi-api-key': token,
        'Content-Type': 'application/json',
      },
    })

    const responseData = await response.json()

    if (!response.ok) {
      throw new Error(`Lỗi API: ${response.status} - ${JSON.stringify(responseData)}`)
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})