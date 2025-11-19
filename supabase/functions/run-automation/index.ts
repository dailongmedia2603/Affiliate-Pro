// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const logToDb = async (supabaseAdmin, runId, message, level = 'INFO', stepId = null, metadata = {}) => {
  try {
    await supabaseAdmin.from('automation_run_logs').insert({ run_id: runId, step_id: stepId, message, level, metadata });
  } catch (e) { console.error('Failed to write log to DB:', e.message); }
};

function replacePlaceholders(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => data[key] || match);
}

serve(async (req) => {
  let runId = null;
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { channelId } = await req.json();
    if (!channelId) throw new Error("channelId is required.");

    const authHeader = req.headers.get('Authorization')!;
    if (!authHeader) {
      throw new Error("Missing Authorization header.");
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    // Check for config BEFORE creating a run
    const { data: configData, error: configError } = await supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', channelId).maybeSingle();
    if (configError) throw new Error(`Error checking config: ${configError.message}`);
    if (!configData) {
      throw new Error("Kênh này chưa được cấu hình. Vui lòng nhấn nút 'Cấu hình' và lưu lại trước khi chạy.");
    }
    const config = configData.config_data;

    const { data: run, error: runError } = await supabaseAdmin
      .from('automation_runs')
      .insert({ user_id: user.id, channel_id: channelId, status: 'starting' })
      .select()
      .single();
    if (runError) throw runError;
    runId = run.id;
    await logToDb(supabaseAdmin, runId, 'Automation run created successfully.');

    const { data: channelRes, error: channelError } = await supabaseAdmin.from('channels').select('product_id, character_image_url').eq('id', channelId).single();
    await logToDb(supabaseAdmin, runId, 'Fetching channel data.');

    if (channelError) throw new Error(`Channel not found: ${channelError.message}`);
    
    const productId = channelRes.product_id;
    const characterImageUrl = channelRes.character_image_url;
    if (!productId) throw new Error("Channel is not linked to any product.");
    await logToDb(supabaseAdmin, runId, 'Configurations validated.');

    const { data: subProducts, error: subProductsError } = await supabaseAdmin
      .from('sub_products')
      .select('id, name, description, image_url')
      .eq('product_id', productId);
    if (subProductsError) throw subProductsError;
    if (!subProducts || subProducts.length === 0) throw new Error("No sub-products found for this channel's product.");
    await logToDb(supabaseAdmin, runId, `Found ${subProducts.length} sub-products to process.`);

    const stepPromises = subProducts.map(async (subProduct) => {
      const placeholderData = { product_name: subProduct.name, background_context: config.backgroundContext };
      const imagePrompt = replacePlaceholders(config.imagePromptTemplate, placeholderData);
      
      const imageUrls = [];
      if (characterImageUrl) imageUrls.push(characterImageUrl);
      if (subProduct.image_url) imageUrls.push(subProduct.image_url);

      const inputData = { prompt: imagePrompt, model: 'banana', aspect_ratio: '1:1', image_urls: imageUrls };

      const { data: step, error: stepError } = await supabaseAdmin
        .from('automation_run_steps')
        .insert({ run_id: run.id, sub_product_id: subProduct.id, step_type: 'generate_image', status: 'pending', input_data: inputData })
        .select('id')
        .single();
      if (stepError) throw stepError;
      await logToDb(supabaseAdmin, runId, `Created 'generate_image' step for sub-product: ${subProduct.name}`, 'INFO', step.id);

      supabaseAdmin.functions.invoke('generate-image', 
        { body: { action: 'generate_image', stepId: step.id, ...inputData } },
        { headers: { Authorization: authHeader } }
      ).catch(console.error);
      await logToDb(supabaseAdmin, runId, `Invoked 'generate-image' function for step ${step.id}.`, 'INFO', step.id);
    });

    await Promise.all(stepPromises);

    await supabaseAdmin.from('automation_runs').update({ status: 'running' }).eq('id', run.id);
    await logToDb(supabaseAdmin, runId, 'All initial steps invoked. Run status set to "running".', 'SUCCESS');

    return new Response(JSON.stringify({ success: true, message: 'Automation started successfully.', runId: run.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    if (runId) {
      await logToDb(supabaseAdmin, runId, `Critical error in run-automation: ${error.message}`, 'ERROR');
      await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
    }
    console.error('Error in run-automation function:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});