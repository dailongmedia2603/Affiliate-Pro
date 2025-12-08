// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API_BASE_URL = 'https://api.rendi.dev/v1';

// Helper to poll Rendi API status
const pollRendiStatus = async (commandId, rendiApiKey) => {
  const url = `${API_BASE_URL}/commands/${commandId}`;
  const options = {
    method: 'GET',
    headers: { 'X-API-KEY': rendiApiKey, 'Content-Type': 'application/json' },
  };

  for (let i = 0; i < 60; i++) { // Poll for up to 5 minutes (60 * 5s)
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || `Rendi API Error: ${response.status}`);
    }

    if (data.status === 'SUCCESS') {
      return data;
    }
    if (data.status === 'FAILED') {
      throw new Error(data.error_message || 'Rendi task failed without a specific error message.');
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before next poll
  }

  throw new Error('Rendi task timed out after 5 minutes.');
};


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Authenticate user and get Rendi API key
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
      .select('rendi_api_key')
      .eq('id', user.id)
      .single();

    const rendiApiKey = settings?.rendi_api_key;
    if (!rendiApiKey) {
      throw new Error('Rendi API key is not set or could not be retrieved.');
    }

    // 2. Get payload from request
    const { sourceUrl, outputFilename } = await req.json();
    if (!sourceUrl || !outputFilename) {
      throw new Error("sourceUrl and outputFilename are required.");
    }

    // 3. Construct Rendi API payload
    const payload = {
      input_files: {
        'in_source_video': sourceUrl,
      },
      output_files: {
        'out_video': outputFilename,
      },
      // Explicitly use libx264 for H.264 encoding and yuv420p for compatibility
      ffmpeg_command: '-i {{in_source_video}} -c:v libx264 -pix_fmt yuv420p -c:a aac {{out_video}}',
    };

    // 4. Call Rendi API to start the command
    const runCommandUrl = `${API_BASE_URL}/run-ffmpeg-command`;
    const runCommandOptions = {
      method: 'POST',
      headers: { 'X-API-KEY': rendiApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    };

    const runResponse = await fetch(runCommandUrl, runCommandOptions);
    const runData = await runResponse.json();

    if (!runResponse.ok) {
      throw new Error(runData.detail || `Rendi API Error: ${runResponse.status}`);
    }
    if (!runData.command_id) {
      throw new Error("Rendi API did not return a command_id.");
    }

    // 5. Poll for the result
    const resultData = await pollRendiStatus(runData.command_id, rendiApiKey);
    const finalVideoUrl = resultData.output_files?.out_video?.storage_url;

    if (!finalVideoUrl) {
      throw new Error('Rendi task succeeded but the final video URL is missing.');
    }

    // 6. Return the new URL
    return new Response(JSON.stringify({ success: true, h264Url: finalVideoUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[export-video-h264] FATAL ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});