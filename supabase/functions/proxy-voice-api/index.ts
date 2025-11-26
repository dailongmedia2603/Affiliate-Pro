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
    console.log(`[proxy-voice-api] INFO: Received request: ${req.method} ${req.url}`);
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
      console.error('[proxy-voice-api] ERROR: Missing required parameters: path or token.');
      return new Response(JSON.stringify({ error: 'Thiếu các tham số bắt buộc: path hoặc token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetUrl = `${API_BASE_URL}/${path}`;
    console.log(`[proxy-voice-api] INFO: Proxying request to ${targetUrl} with method ${method}.`);

    const headers: Record<string, string> = { 
      'xi-api-key': token,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    };

    if (!isFormData) {
        headers['Content-Type'] = 'application/json';
    }

    const fetchOptions: RequestInit = { method, headers };

    if (method !== 'GET' && body) {
      if (isFormData) {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }
    
    const response = await fetch(targetUrl, fetchOptions);
    const responseText = await response.text();
    console.log(`[proxy-voice-api] INFO: Received response from external API. Status: ${response.status}, Body: ${responseText.substring(0, 500)}`);
    
    if (!response.ok) {
      console.error(`[proxy-voice-api] ERROR: External API returned non-OK status. Status: ${response.status}, Body: ${responseText}`);
      let errorMessage = `Lỗi từ API Voice (${response.status})`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.message || errorJson.error || JSON.stringify(errorJson);
      } catch (e) {
        // Not a JSON error, use the raw text if it's not empty
        if (responseText) {
          errorMessage = `${errorMessage}: ${responseText}`;
        } else if (response.status === 502) {
          errorMessage = `${errorMessage}: Bad Gateway. Máy chủ dịch vụ Voice có thể đang gặp sự cố hoặc quá tải. Vui lòng thử lại sau.`;
        }
      }
      throw new Error(errorMessage);
    }

    // Handle cases where response is OK but body is empty
    if (!responseText) {
        console.warn('[proxy-voice-api] WARN: External API returned an empty response body with a 2xx status.');
        // Depending on the API, this might be an error or an expected response.
        // We'll treat it as a success with empty data for now.
        return new Response(JSON.stringify({ success: true, data: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    const responseData = JSON.parse(responseText);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[proxy-voice-api] FATAL: An error occurred: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
})