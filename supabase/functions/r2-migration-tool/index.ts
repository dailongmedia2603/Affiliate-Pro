// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = { 
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// --- R2 Helper Functions ---
const toHex = (data) => Array.from(new Uint8Array(data)).map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmacSha256(key, data) {
  const cryptoKey = await crypto.subtle.importKey("raw", typeof key === "string" ? new TextEncoder().encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return signature;
}

async function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = await hmacSha256(`AWS4${key}`, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  return await hmacSha256(kService, "aws4_request");
}

async function getR2PresignedUrl(fileName, contentType) {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("CLOUDFLARE_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("CLOUDFLARE_SECRET_ACCESS_KEY");
  const bucketName = Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("Cloudflare R2 environment variables are not set.");
  }
  const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const method = "PUT";
  const canonicalUri = `/${fileName}`;
  const t = new Date();
  const amzDate = t.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = t.toISOString().slice(0, 10).replace(/-/g, '');
  const expires = 3600;
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
  return `https://${host}${canonicalUri}?${canonicalQuerystring}&X-Amz-Signature=${signature}`;
}

async function uploadToR2(fileBuffer, fileName, contentType) {
  const presignedUrl = await getR2PresignedUrl(fileName, contentType);
  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBuffer
  });
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload to R2: ${await uploadResponse.text()}`);
  }
  const publicUrl = Deno.env.get("CLOUDFLARE_R2_PUBLIC_URL");
  if (!publicUrl) {
    throw new Error("CLOUDFLARE_R2_PUBLIC_URL is not set.");
  }
  return `${publicUrl}/${fileName}`;
}
// --- End R2 Helper Functions ---

const MIGRATION_CONFIG = [
  { bucket: 'banners', table: 'banners', column: 'image_url', r2Folder: 'banners' },
  { bucket: 'feature_images', table: 'features', column: 'image_url', r2Folder: 'feature_images' },
  { bucket: 'feature_images', table: 'features', column: 'illustration_image_url', r2Folder: 'feature_images' },
  { bucket: 'template_images', table: null, column: null, r2Folder: 'template_images' },
  { bucket: 'template_thumbnails', table: 'templates', column: 'preview_url', r2Folder: 'template_thumbnails' },
  { bucket: 'app_assets', table: 'configs', column: 'value', r2Folder: 'ui_assets', isConfigTable: true }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const r2PublicUrl = Deno.env.get("CLOUDFLARE_R2_PUBLIC_URL");
    if (!r2PublicUrl) {
      throw new Error("CLOUDFLARE_R2_PUBLIC_URL is not set.");
    }
    const summary = {};
    for (const config of MIGRATION_CONFIG) {
      console.log(`Starting migration for bucket: ${config.bucket}`);
      summary[config.bucket] = { migrated: 0, skipped: 0, failed: 0, errors: [] };
      const { data: files, error: listError } = await supabaseAdmin.storage.from(config.bucket).list('', { limit: 1000 });
      if (listError) {
        summary[config.bucket].errors.push(`Failed to list files: ${listError.message}`);
        continue;
      }
      for (const file of files) {
        if (file.name === '.emptyFolderPlaceholder') continue;
        try {
          const { data: publicUrlData } = supabaseAdmin.storage.from(config.bucket).getPublicUrl(file.name);
          const oldUrl = publicUrlData.publicUrl;
          // Idempotency Check: Skip if already migrated
          if (config.table && config.column) {
            const { data: existingRecord, error: checkError } = await supabaseAdmin.from(config.table).select(config.column).eq(config.column, oldUrl).limit(1);
            if (checkError) {
              throw new Error(`DB check failed for ${file.name}: ${checkError.message}`);
            }
            if (existingRecord && existingRecord.length > 0 && existingRecord[0][config.column].startsWith(r2PublicUrl)) {
              summary[config.bucket].skipped++;
              continue;
            }
          }
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage.from(config.bucket).download(file.name);
          if (downloadError) {
            throw new Error(`Download failed for ${file.name}: ${downloadError.message}`);
          }
          const newR2Url = await uploadToR2(fileData, `${config.r2Folder}/${file.name}`, file.metadata.mimetype);
          if (config.table && config.column) {
            let updateQuery = supabaseAdmin.from(config.table).update({ [config.column]: newR2Url });
            if (config.isConfigTable) {
              // For configs table, we match by value which is the old URL
              updateQuery = updateQuery.eq(config.column, oldUrl);
            } else {
              // For other tables, we also match by the old URL
              updateQuery = updateQuery.eq(config.column, oldUrl);
            }
            const { error: updateError } = await updateQuery;
            if (updateError) {
              throw new Error(`DB update failed for ${file.name}: ${updateError.message}`);
            }
          }
          summary[config.bucket].migrated++;
        } catch (err) {
          console.error(`Error migrating ${file.name} from ${config.bucket}:`, err.message);
          summary[config.bucket].failed++;
          summary[config.bucket].errors.push(`${file.name}: ${err.message}`);
        }
      }
    }
    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });
  } catch (error) {
    console.error("[r2-migration-tool] CRITICAL ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});