// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"};

const toHex = (data)=>Array.from(new Uint8Array(data)).map((b)=>b.toString(16).padStart(2, '0')).join('');
async function hmacSha256(key, data) { const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, [ "sign" ]); const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data)); return signature;}
async function getSignatureKey(key, dateStamp, regionName, serviceName) { const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key), dateStamp); const kRegion = await hmacSha256(kDate, regionName); const kService = await hmacSha256(kRegion, serviceName); const kSigning = await hmacSha256(kService, "aws4_request"); return kSigning;}

serve(async (req)=>{ 
  if (req.method === "OPTIONS") { 
    return new Response("ok", { headers: corsHeaders }); 
  } 
  try { 
    const { fileName, contentType } = await req.json(); 
    if (!fileName || !contentType) throw new Error("fileName and contentType are required."); 
    
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
      .select('cloudflare_account_id, cloudflare_access_key_id, cloudflare_secret_access_key, cloudflare_r2_bucket_name')
      .eq('id', user.id)
      .single();
    
    if (settingsError || !settings) throw new Error("Could not retrieve R2 settings for user.");

    const { 
        cloudflare_account_id: accountId, 
        cloudflare_access_key_id: accessKeyId, 
        cloudflare_secret_access_key: secretAccessKey, 
        cloudflare_r2_bucket_name: bucketName
    } = settings;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) { 
      throw new Error("Cloudflare R2 credentials are not set completely for this user."); 
    } 
    
    const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`; 
    const region = "auto"; 
    const service = "s3"; 
    const method = "PUT"; 
    const canonicalUri = `/${fileName}`; 
    const t = new Date(); 
    const amzDate = t.toISOString().replace(/[:\-]|\.\d{3}/g, ''); 
    const dateStamp = t.toISOString().slice(0, 10).replace(/-/g, ''); 
    const expires = 3600; // 1 hour 
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`; 
    const signedHeaders = "host"; 
    const canonicalQuerystring = `X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${encodeURIComponent(`${accessKeyId}/${credentialScope}`)}&X-Amz-Date=${amzDate}&X-Amz-Expires=${expires}&X-Amz-SignedHeaders=${signedHeaders}`; 
    const canonicalHeaders = `host:${host}\n`; 
    const payloadHash = "UNSIGNED-PAYLOAD"; 
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`; 
    const algorithm = "AWS4-HMAC-SHA256"; 
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest)))}`; 
    const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service); 
    const signature = toHex(await hmacSha256(signingKey, stringToSign)); 
    const presignedUrl = `https://${host}${canonicalUri}?${canonicalQuerystring}&X-Amz-Signature=${signature}`; 
    return new Response(JSON.stringify({ url: presignedUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); 
  } catch (error) { 
    console.error("r2-generate-upload-url: CATCH BLOCK ERROR:", error.message); 
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }); 
  }
});