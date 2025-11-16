// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE_URL = 'https://gateway.vivoo.work'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const isFormData = req.headers.get('content-type')?.includes('multipart/form-data');
    let path, token, method, body;

    if (isFormData) {
      const formData = await req.formData();
      path = formData.get('path');
      token = formData.get('token');
      method = formData.get('method') || 'POST';
      
      const forwardFormData = new FormData();
      for (const [key, value] of formData.entries()) {
        if (!['path', 'token', 'method'].includes(key)) {
          forwardFormData.append(key, value);
        }
      }
      body = forwardFormData;

    } else {
      const payload = await req.json();
      path = payload.path;
      token = payload.token;
      method = payload.method || 'GET';
      body = payload.body;
    }

    if (!path || !token) {
      return new Response(JSON.stringify({ error: 'Thiếu các tham số bắt buộc: path hoặc token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetUrl = `${API_BASE_URL}/${path}`;

    const headers = { 'xi-api-key': token };
    const fetchOptions = { method, headers };

    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      if (isFormData) {
        fetchOptions.body = body;
      } else if (body) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(body);
      }
    }
    
    const response = await fetch(targetUrl, fetchOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lỗi API: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})