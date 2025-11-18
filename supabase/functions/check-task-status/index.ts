// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const API_BASE = "https://api.beautyapp.work";

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
  if (!tokenData.jwt) {
    throw new Error('Phản hồi từ Higgsfield không chứa token (jwt).');
  }
  return tokenData.jwt;
}

async function getTaskStatus(token, taskId) {
  const response = await fetch(`${API_BASE}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, taskid: taskId })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Không thể lấy trạng thái tác vụ ${taskId}: ${errorText}`);
  }
  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('Unauthorized attempt to run cron job.');
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  try {
    console.log("--- Cron Job: Check Task Status Started ---");
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch pending video tasks
    const { data: videoTasks, error: videoError } = await supabaseAdmin
      .from('video_tasks')
      .select('id, user_id, higgsfield_task_id, status')
      .in('status', ['pending', 'processing', 'in_progress']);
    if (videoError) throw videoError;
    console.log(`[INFO] Found ${videoTasks?.length || 0} pending video tasks.`);

    // 2. Fetch pending image tasks
    const { data: imageTasks, error: imageError } = await supabaseAdmin
      .from('higgsfield_generation_logs')
      .select('id, user_id, api_task_id, status')
      .eq('status', 'processing');
    if (imageError) throw imageError;
    console.log(`[INFO] Found ${imageTasks?.length || 0} pending image tasks.`);

    // 3. Combine tasks into a unified structure
    const allTasks = [
      ...(videoTasks || []).map(t => ({ ...t, type: 'video', higgsfield_task_id: t.higgsfield_task_id })),
      ...(imageTasks || []).map(t => ({ ...t, type: 'image', higgsfield_task_id: t.api_task_id }))
    ];

    if (allTasks.length === 0) {
      console.log("[INFO] No pending tasks to check. Exiting.");
      return new Response(JSON.stringify({ message: 'Không có tác vụ nào đang chờ xử lý.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[INFO] Total tasks to check: ${allTasks.length}`);

    const userCache = new Map();
    let tasksUpdated = 0;

    for (const task of allTasks) {
      try {
        console.log(`[INFO] Processing task ID: ${task.id} (Type: ${task.type}, Higgsfield ID: ${task.higgsfield_task_id})`);
        
        if (!task.higgsfield_task_id) {
            console.warn(`[WARN] Skipping task ID ${task.id} (Type: ${task.type}) due to missing higgsfield_task_id.`);
            continue;
        }

        let cachedUser = userCache.get(task.user_id);
        if (!cachedUser) {
          console.log(`[INFO] Fetching settings for new user: ${task.user_id}`);
          const { data: settings, error: settingsError } = await supabaseAdmin
            .from('user_settings')
            .select('higgsfield_cookie, higgsfield_clerk_context')
            .eq('id', task.user_id)
            .single();

          if (settingsError || !settings?.higgsfield_cookie || !settings?.higgsfield_clerk_context) {
            console.warn(`[WARN] Skipping tasks for user ${task.user_id}: Settings not found.`);
            userCache.set(task.user_id, { token: null }); // Cache that settings are missing
            continue;
          }
          
          const token = await getHiggsfieldToken(settings.higgsfield_cookie, settings.higgsfield_clerk_context);
          cachedUser = { token };
          userCache.set(task.user_id, cachedUser);
        } else if (!cachedUser.token) {
            console.log(`[INFO] Skipping task for user ${task.user_id} due to previously failed settings fetch.`);
            continue;
        }

        const statusData = await getTaskStatus(cachedUser.token, task.higgsfield_task_id);
        const job = statusData?.jobs?.[0];
        const apiStatus = job?.status;
        console.log(`[INFO] Higgsfield API status for task ${task.higgsfield_task_id}: ${apiStatus}`);

        if (apiStatus && apiStatus !== task.status && ['completed', 'failed', 'nsfw'].includes(apiStatus)) {
          console.log(`[INFO] Status changed for task ${task.id}. Old: ${task.status}, New: ${apiStatus}. Preparing update.`);
          
          const resultUrl = job?.results?.raw?.url;
          const errorMessage = job?.error;
          
          let updatePayload = {};
          let tableName = '';

          if (task.type === 'video') {
            tableName = 'video_tasks';
            updatePayload = { status: apiStatus, result_url: resultUrl, error_message: errorMessage };
          } else { // image
            tableName = 'higgsfield_generation_logs';
            updatePayload = { status: apiStatus, result_image_url: resultUrl, error_message: errorMessage };
          }

          console.log(`[INFO] Updating table '${tableName}' for ID ${task.id}`);
          const { error: updateError } = await supabaseAdmin
            .from(tableName)
            .update(updatePayload)
            .eq('id', task.id);

          if (updateError) {
            console.error(`[ERROR] Failed to update task ${task.id} in table ${tableName}:`, updateError);
          } else {
            tasksUpdated++;
            console.log(`[SUCCESS] Updated task ${task.id} (${tableName}) to status: ${apiStatus}`);
          }
        } else {
            console.log(`[INFO] No status change for task ${task.id}. Current status: ${task.status}, API status: ${apiStatus}`);
        }
      } catch (e) {
        console.error(`[ERROR] Failed to process task ${task.id} (Higgsfield ID: ${task.higgsfield_task_id}):`, e.message);
      }
    }

    const summary = `--- Cron Job Finished. Checked ${allTasks.length} tasks. Updated ${tasksUpdated} tasks. ---`;
    console.log(summary);
    return new Response(JSON.stringify({ message: summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FATAL] An error occurred in the check-task-status function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});