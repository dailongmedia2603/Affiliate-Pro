// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to replace placeholders in a string
function replacePlaceholders(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] || match;
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { channelId } = await req.json();
    if (!channelId) throw new Error("channelId is required.");

    // 1. Initialize clients and authenticate user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("User not authenticated.");

    // 2. Create a new run record
    const { data: run, error: runError } = await supabaseAdmin
      .from('automation_runs')
      .insert({ user_id: user.id, channel_id: channelId, status: 'starting' })
      .select()
      .single();
    if (runError) throw runError;

    // 3. Fetch all necessary data
    const [channelRes, configRes] = await Promise.all([
      supabaseAdmin.from('channels').select('product_id, character_image_url').eq('id', channelId).single(),
      supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', channelId).single()
    ]);

    if (channelRes.error) throw new Error(`Channel not found: ${channelRes.error.message}`);
    if (configRes.error) throw new Error(`Automation config not found for this channel: ${configRes.error.message}`);
    
    const productId = channelRes.data.product_id;
    const characterImageUrl = channelRes.data.character_image_url;
    const config = configRes.data.config_data;
    if (!productId) throw new Error("Channel is not linked to any product.");
    if (!config) throw new Error("Automation is not configured for this channel.");

    const { data: subProducts, error: subProductsError } = await supabaseAdmin
      .from('sub_products')
      .select('id, name, description, image_url')
      .eq('product_id', productId);
    if (subProductsError) throw subProductsError;
    if (!subProducts || subProducts.length === 0) throw new Error("No sub-products found for this channel's product.");

    // 4. Loop through sub-products and create initial 'generate_image' steps
    const stepPromises = subProducts.map(async (subProduct) => {
      const placeholderData = {
        product_name: subProduct.name,
        background_context: config.backgroundContext,
      };
      const imagePrompt = replacePlaceholders(config.imagePromptTemplate, placeholderData);
      
      const imageUrls = [];
      if (characterImageUrl) {
        imageUrls.push(characterImageUrl);
      }
      // Also add sub-product image if it exists
      if (subProduct.image_url) {
        imageUrls.push(subProduct.image_url);
      }

      const inputData = {
        prompt: imagePrompt,
        model: 'banana',
        aspect_ratio: '1:1',
        image_urls: imageUrls,
      };

      const { data: step, error: stepError } = await supabaseAdmin
        .from('automation_run_steps')
        .insert({
          run_id: run.id,
          sub_product_id: subProduct.id,
          step_type: 'generate_image',
          status: 'pending',
          input_data: inputData,
        })
        .select('id')
        .single();
      if (stepError) throw stepError;

      // Invoke the image generation function but don't wait for it to finish
      supabaseAdmin.functions.invoke('generate-image', {
        body: {
          action: 'generate_image',
          stepId: step.id, // Pass stepId to the function
          ...inputData,
        },
      }).catch(console.error); // Fire and forget
    });

    await Promise.all(stepPromises);

    // 5. Update run status to 'running'
    await supabaseAdmin
      .from('automation_runs')
      .update({ status: 'running' })
      .eq('id', run.id);

    return new Response(JSON.stringify({ success: true, message: 'Automation started successfully.', runId: run.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in run-automation function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});