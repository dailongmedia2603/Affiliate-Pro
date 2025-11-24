// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { channelId } = await req.json();
    if (!channelId) {
      throw new Error("channelId is required.");
    }

    // Authenticate user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated.");
    }

    // Use admin client for deletions
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user owns the channel
    const { data: channel, error: channelError } = await supabaseAdmin
      .from('channels')
      .select('id, user_id, avatar, character_image_url')
      .eq('id', channelId)
      .eq('user_id', user.id)
      .single();

    if (channelError || !channel) {
      throw new Error("Channel not found or you don't have permission to delete it.");
    }

    // --- Deletion Logic ---

    // 1. Get related run IDs
    const { data: runs, error: runsError } = await supabaseAdmin
      .from('automation_runs')
      .select('id')
      .eq('channel_id', channelId);
    if (runsError) throw runsError;
    const runIds = runs.map(r => r.id);

    // 2. Delete all related data
    if (runIds.length > 0) {
      await supabaseAdmin.from('automation_run_logs').delete().in('run_id', runIds);
      await supabaseAdmin.from('automation_run_steps').delete().in('run_id', runIds);
      await supabaseAdmin.from('automation_runs').delete().in('id', runIds);
    }

    await supabaseAdmin.from('automation_configs').delete().eq('channel_id', channelId);
    await supabaseAdmin.from('video_tasks').delete().eq('channel_id', channelId);

    // 3. Delete storage files
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const filesToDelete = [];

    if (channel.avatar && channel.avatar.includes(supabaseUrl)) {
      const path = new URL(channel.avatar).pathname.split('/images/')[1];
      if (path) filesToDelete.push(path);
    }
    if (channel.character_image_url && channel.character_image_url.includes(supabaseUrl)) {
      const path = new URL(channel.character_image_url).pathname.split('/images/')[1];
      if (path) filesToDelete.push(path);
    }

    if (filesToDelete.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage.from('images').remove(filesToDelete);
      if (storageError) {
        // Log the error but don't fail the whole operation
        console.error(`Failed to delete storage files for channel ${channelId}:`, storageError.message);
      }
    }
    
    // 4. Finally, delete the channel itself
    const { error: deleteChannelError } = await supabaseAdmin
      .from('channels')
      .delete()
      .eq('id', channelId);
    if (deleteChannelError) throw deleteChannelError;

    return new Response(JSON.stringify({ success: true, message: 'Channel and all related data deleted.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in delete-channel function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});