// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as jose from 'npm:jose@^5.2.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

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
    const { prompt, userId: payloadUserId } = await req.json();
    if (!prompt) throw new Error("Thiếu tham số bắt buộc: prompt");
    
    let userId;
    if (payloadUserId) {
        userId = payloadUserId;
    } else {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) throw new Error("Xác thực người dùng thất bại.");
        userId = user.id;
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('vertex_ai_service_account')
      .eq('id', userId)
      .single();

    if (settingsError || !settings || !settings.vertex_ai_service_account) {
      throw new Error('Không tìm thấy Service Account. Vui lòng kiểm tra lại cài đặt.');
    }
    const { vertex_ai_service_account } = settings;
    
    const gcp_project_id = vertex_ai_service_account.project_id;
    if (!gcp_project_id) {
        throw new Error("File JSON Service Account không chứa 'project_id'.");
    }

    const accessToken = await getGoogleAccessToken(vertex_ai_service_account);

    const vertexUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/${gcp_project_id}/locations/us-central1/publishers/google/models/gemini-1.5-pro-preview-0409:generateContent`;
    
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

    return new Response(JSON.stringify({ success: true, data: generatedText }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error('!!! [FATAL] An error occurred in the proxy-vertex-ai function:', err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});