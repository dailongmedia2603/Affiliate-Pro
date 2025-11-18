// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"};

serve(async (req)=>{ 
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
      .select('cloudflare_r2_public_url')
      .eq('id', user.id)
      .single();
    
    if (settingsError || !settings) throw new Error("Could not retrieve R2 settings for user.");

    const { cloudflare_r2_public_url: publicUrl } = settings;

    if (!publicUrl) { 
      throw new Error("CLOUDFLARE_R2_PUBLIC_URL is not set for this user."); 
    } 
    return new Response(JSON.stringify({ publicUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }); 
  } catch (error) { 
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }); 
  }
});