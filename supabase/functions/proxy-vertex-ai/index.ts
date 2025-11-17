// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const REGION = 'us-central1';
const MODEL_ID = 'gemini-1.5-pro-latest';

// Hàm để lấy Access Token từ Google bằng Service Account
async function getAccessToken(serviceAccount) {
  const scope = "https://www.googleapis.com/auth/cloud-platform";
  const aud = "https://oauth2.googleapis.com/token";

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    (new TextEncoder()).decode(serviceAccount.private_key.replace(/\\n/g, "\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["sign"]
  );

  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: serviceAccount.client_email,
      scope: scope,
      aud: aud,
      exp: getNumericDate(3600), // Token hết hạn sau 1 giờ
      iat: getNumericDate(0),
    },
    privateKey
  );

  const response = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokens = await response.json();
  if (!tokens.access_token) {
    throw new Error(`Không thể lấy access token: ${JSON.stringify(tokens)}`);
  }
  return tokens.access_token;
}

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

    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('gcp_project_id, vertex_ai_service_account')
      .eq('id', user.id)
      .single();

    if (settingsError || !settings || !settings.gcp_project_id || !settings.vertex_ai_service_account) {
      throw new Error('Không tìm thấy GCP Project ID hoặc Service Account. Vui lòng kiểm tra lại cài đặt.');
    }
    
    const { gcp_project_id, vertex_ai_service_account } = settings;
    const { prompt } = await req.json();
    if (!prompt) throw new Error('Thiếu tham số bắt buộc: prompt');

    const accessToken = await getAccessToken(vertex_ai_service_account);
    
    const apiUrl = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${gcp_project_id}/locations/${REGION}/publishers/google/models/${MODEL_ID}:generateContent`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Lỗi từ API Vertex AI: ${response.status} - ${responseText}`);
    }

    const responseJson = JSON.parse(responseText);
    const generatedText = responseJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (generatedText === undefined) {
      throw new Error('Không thể phân tích phản hồi từ API Vertex AI.');
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