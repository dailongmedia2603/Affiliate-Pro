// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// --- R2 Helper Functions ---
const toHex = (data) => Array.from(new Uint8Array(data)).map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmacSha256(key, data) { 
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [ "sign" ]); 
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)); 
  return signature;
}

async function getSignatureKey(key, dateStamp, regionName, serviceName) { 
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp); 
  const kRegion = await hmacSha256(kDate, regionName); 
  const kService = await hmacSha256(kRegion, serviceName); 
  const kSigning = await hmacSha256(kService, "aws4_request"); 
  return kSigning;
}
// --- End R2 Helper Functions ---

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    // 2. Get R2 settings from user_settings
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('cloudflare_account_id, cloudflare_access_key_id, cloudflare_secret_access_key, cloudflare_r2_bucket_name, cloudflare_r2_public_url').eq('id', user.id).single();
    if (settingsError || !settings) throw new Error(`Could not retrieve R2 settings for user: ${settingsError?.message}`);
    const { cloudflare_account_id: accountId, cloudflare_access_key_id: accessKeyId, cloudflare_secret_access_key: secretAccessKey, cloudflare_r2_bucket_name: bucketName, cloudflare_r2_public_url: publicUrl } = settings;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
      throw new Error("Cloudflare R2 credentials are not set completely for this user.");
    }

    // 3. Get external URL from request body
    const { externalUrl } = await req.json();
    if (!externalUrl) {
      throw new Error("externalUrl is required in the request body.");
    }

    // 4. Fetch the external image
    const imageResponse = await fetch(externalUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image from external URL: ${imageResponse.status} ${imageResponse.statusText}`);
    }
    const fileBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'application/octet-stream';
    const originalFileName = externalUrl.split('/').pop()?.split('?')[0] || 'image.jpg';

    // 5. Upload to R2
    const fileName = `${user.id}/${Date.now()}_${originalFileName.replace(/\s/g, '_')}`;
    const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`;
    const region = "auto";
    const service = "s3";
    const method = "PUT";
    const canonicalUri = `/${fileName}`;
    const endpoint = `https://${host}${canonicalUri}`;
    
    const t = new Date();
    const amzDate = t.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = t.toISOString().slice(0, 10).replace(/-/g, '');
    
    const payloadHash = toHex(await crypto.subtle.digest("SHA-256", fileBuffer));
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    
    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest)))}`;
    
    const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));
    
    const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const headers = {
      'Authorization': authorizationHeader,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Content-Type': contentType,
      'Content-Length': fileBuffer.byteLength.toString()
    };

    const uploadResponse = await fetch(endpoint, {
      method: 'PUT',
      headers,
      body: fileBuffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`R2 upload failed (status: ${uploadResponse.status}): ${errorText}`);
    }

    // 6. Return the new R2 URL
    const r2Url = `${publicUrl}/${fileName}`;
    return new Response(JSON.stringify({ r2Url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[ingest-external-image] CATCH BLOCK ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});