// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

async function getSignatureKey(key, dateStamp, regionName, serviceName) { 
  const kDate = await hmacSha256(`AWS4${key}`, dateStamp); 
  const kRegion = await hmacSha256(kDate, regionName); 
  const kService = await hmacSha256(kRegion, serviceName); 
  return await hmacSha256(kService, "aws4_request");
}

async function hmacSha256(key, data) { 
  const cryptoKey = await crypto.subtle.importKey("raw", typeof key === "string" ? new TextEncoder().encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, [ "sign" ]); 
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)); 
  return signature;
}

function toHex(buffer) { 
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('cloudflare_account_id, cloudflare_access_key_id, cloudflare_secret_access_key, cloudflare_r2_bucket_name, cloudflare_r2_public_url')
      .eq('id', user.id)
      .single();

    if (settingsError || !settings) throw new Error("Could not retrieve R2 settings for user.");

    const {
      cloudflare_account_id: accountId,
      cloudflare_access_key_id: accessKeyId,
      cloudflare_secret_access_key: secretAccessKey,
      cloudflare_r2_bucket_name: bucketName,
      cloudflare_r2_public_url: publicUrl
    } = settings;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
      throw new Error("Cloudflare R2 credentials are not set completely for this user.");
    }

    const endpoint = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`;
    const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`;
    const method = 'GET';
    const service = 's3';
    const region = 'auto';
    const canonicalUri = '/';
    const canonicalQuerystring = '';
    const t = new Date();
    const amzDate = t.toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const emptyPayloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyPayloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${emptyPayloadHash}`;
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest)))}`;
    const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));
    const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    const response = await fetch(endpoint, { 
      method: 'GET', 
      headers: { 'Authorization': authorizationHeader, 'x-amz-date': amzDate, 'x-amz-content-sha256': emptyPayloadHash } 
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list files: ${await response.text()}`);
    }
    
    const xmlText = await response.text();
    const files = [...xmlText.matchAll(/<Contents>(.*?)<\/Contents>/gs)].map((match) => {
      const keyMatch = match[1].match(/<Key>(.*?)<\/Key>/);
      const sizeMatch = match[1].match(/<Size>(.*?)<\/Size>/);
      const lastModifiedMatch = match[1].match(/<LastModified>(.*?)<\/LastModified>/);
      const key = keyMatch ? keyMatch[1] : null;
      return {
        key: key,
        size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
        lastModified: lastModifiedMatch ? lastModifiedMatch[1] : null,
        url: `${publicUrl}/${key}`
      };
    });
    
    return new Response(JSON.stringify(files), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});