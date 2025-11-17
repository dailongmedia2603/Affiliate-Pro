// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import * as jose from 'npm:jose@^5.2.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Hàm lấy Access Token từ Google, dựa trên code bạn cung cấp
async function getGoogleAccessToken(credentials) {
  const privateKey = await jose.importPKCS8(credentials.private_key, 'RS256');
  
  const jwt = await new jose.SignJWT({
    scope: 'https://www.googleapis.com/auth/cloud-platform'
  })
  .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
  .setIssuedAt()
  .setIssuer(credentials.client_email)
  .setAudience('https://oauth2.googleapis.com/token')
  .setExpirationTime('1h')
  .sign(privateKey);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Lỗi xác thực Google: ${response.status} - ${errorText}`);
  }

  const { access_token } = await response.json();
  return access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Xác thực người dùng Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("Xác thực người dùng thất bại.");

    // 2. Lấy thông tin từ request body và cài đặt của người dùng
    const { prompt } = await req.json();
    if (!prompt) throw new Error("Thiếu tham số bắt buộc: prompt");

    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('gcp_project_id, vertex_ai_service_account')
      .eq('id', user.id)
      .single();

    if (settingsError || !settings || !settings.gcp_project_id || !settings.vertex_ai_service_account) {
      throw new Error('Không tìm thấy GCP Project ID hoặc Service Account. Vui lòng kiểm tra lại cài đặt.');
    }
    const { gcp_project_id, vertex_ai_service_account } = settings;

    // 3. Lấy Access Token
    const accessToken = await getGoogleAccessToken(vertex_ai_service_account);

    // 4. Gọi API Vertex AI
    const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${gcp_project_id}/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent`;
    
    const vertexResponse = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      })
    });

    if (!vertexResponse.ok) {
      const errorText = await vertexResponse.text();
      throw new Error(`Lỗi từ API Vertex AI: ${vertexResponse.status} - ${errorText}`);
    }

    const vertexData = await vertexResponse.json();
    const generatedText = vertexData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (generatedText === undefined) {
      throw new Error('Không thể phân tích phản hồi từ API Vertex AI.');
    }

    // 5. Trả về kết quả
    return new Response(JSON.stringify({ success: true, data: generatedText }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error('!!! [FATAL] An error occurred in the proxy-vertex-ai function:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, // Trả về 500 cho lỗi server
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});