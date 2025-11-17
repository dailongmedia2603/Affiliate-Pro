// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE = "https://api.beautyapp.work";

// Helper to get Higgsfield token
async function getHiggsfieldToken(cookie, clerk_active_context) {
  const tokenResponse = await fetch(`${API_BASE}/gettoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie, clerk_active_context }),
  });
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Lỗi khi lấy token từ Higgsfield: ${tokenResponse.status} - ${errorText}`);
  }
  const tokenData = await tokenResponse.json();
  if (!tokenData || !tokenData.jwt) {
    throw new Error('Phản hồi từ Higgsfield không chứa token (jwt).');
  }
  return tokenData.jwt;
}

serve(async (req) => {
  // Security check: Only allow requests from the Cron Job
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log('[CRON] Starting task status update job...');
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch all pending tasks from both tables
    const PENDING_STATUSES = ['pending', 'processing', 'in_progress'];
    const { data: imageTasks, error: imageError } = await supabaseAdmin.from('image_tasks').select('id, higgsfield_task_id, status').in('status', PENDING_STATUSES);
    const { data: videoTasks, error: videoError } = await supabaseAdmin.from('video_tasks').select('id, higgsfield_task_id, status').in('status', PENDING_STATUSES);

    if (imageError) throw imageError;
    if (videoError) throw videoError;

    const allPendingTasks = [
      ...imageTasks.map(t => ({ ...t, type: 'image' })),
      ...videoTasks.map(t => ({ ...t, type: 'video' }))
    ];

    if (allPendingTasks.length === 0) {
      console.log('[CRON] No pending tasks to check. Job finished.');
      return new Response(JSON.stringify({ message: 'No pending tasks.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[CRON] Found ${allPendingTasks.length} pending tasks to check.`);

    // We assume all tasks for a user use the same credentials.
    // For a multi-tenant system, this would need to fetch credentials per user.
    // Here, we fetch one user's settings as a proxy for system-wide credentials.
    const { data: settings, error: settingsError } = await supabaseAdmin.from('user_settings').select('higgsfield_cookie, higgsfield_clerk_context').limit(1).single();
    if (settingsError || !settings) throw new Error('Could not load Higgsfield credentials from user_settings.');
    
    const token = await getHiggsfieldToken(settings.higgsfield_cookie, settings.higgsfield_clerk_context);

    let updates = 0;
    for (const task of allPendingTasks) {
      console.log(`[CRON] Checking ${task.type} task ID: ${task.id} (Higgsfield ID: ${task.higgsfield_task_id})`);
      const statusResponse = await fetch(`${API_BASE}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, taskid: task.higgsfield_task_id })
      });

      if (!statusResponse.ok) {
        console.error(`[CRON] API error for task ${task.higgsfield_task_id}: ${statusResponse.status}`);
        continue;
      }

      const statusData = await statusResponse.json();
      const apiStatus = statusData?.jobs?.[0]?.status;

      if (apiStatus && apiStatus !== task.status) {
        const updatePayload = {
          status: apiStatus,
          result_url: statusData.jobs?.[0]?.results?.raw?.url,
          error_message: statusData.jobs?.[0]?.error,
        };
        
        const tableName = task.type === 'image' ? 'image_tasks' : 'video_tasks';
        const { error: updateError } = await supabaseAdmin.from(tableName).update(updatePayload).eq('id', task.id);

        if (updateError) {
          console.error(`[CRON] Failed to update DB for task ${task.id}:`, updateError.message);
        } else {
          updates++;
          console.log(`[CRON] Updated status for task ${task.id} to "${apiStatus}"`);
        }
      }
    }

    console.log(`[CRON] Job finished. Updated ${updates} tasks.`);
    return new Response(JSON.stringify({ message: `Checked ${allPendingTasks.length} tasks, updated ${updates}.` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[CRON] FATAL ERROR:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})