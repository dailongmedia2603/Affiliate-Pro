// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Xử lý yêu cầu preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { apiUrl, prompt, token } = await req.json()

    if (!apiUrl || !prompt || !token) {
      return new Response(JSON.stringify({ error: 'Thiếu các tham số bắt buộc: apiUrl, prompt, hoặc token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const formData = new FormData()
    formData.append('prompt', prompt)
    formData.append('token', token)

    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
    })

    const responseData = await response.text()

    if (!response.ok) {
      throw new Error(`Lỗi API: ${response.status} - ${responseData}`)
    }

    return new Response(responseData, {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})