// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: videoTasks, error: videoError } = await supabaseAdmin
      .from('video_tasks')
      .select('id, user_id, higgsfield_task_id, status')
      .in('status', ['pending', 'processing', 'in_progress']);

    if (videoError) throw videoError;

    const allTasks = [...(videoTasks || []).map(t => ({ ...t, type: 'video' }))];

    if (allTasks.length === 0) {
      return new Response(JSON.stringify({ message: 'Không có tác vụ nào đang chờ xử lý.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`Found ${allTasks.length} pending tasks to check.`);

    const userCache = new Map();
    let tasksUpdated = 0;

    for (const task of allTasks) {
      try {
        let cachedUser = userCache.get(task.user_id);
        if (!cachedUser) {
          const { data: settings, error: settingsError } = await supabaseAdmin
            .from('user_settings')
            .select('higgsfield_cookie, higgsfield_clerk_context')
            .eq('id', task.user_id)
            .single();

          if (settingsError || !settings?.higgsfield_cookie || !settings?.higgsfield_clerk_context) {
            console.warn(`Bỏ qua tác vụ ${task.id} cho người dùng ${task.user_id}: Không tìm thấy cài đặt.`);
            continue;
          }
          
          const token = await getHiggsfieldToken(settings.higgsfield_cookie, settings.higgsfield_clerk_context);
          cachedUser = { token };
          userCache.set(task.user_id, cachedUser);
        }

        const statusData = await getTaskStatus(cachedUser.token, task.higgsfield_task_id);
        
        const apiStatus = statusData?.jobs?.[0]?.status;
        if (apiStatus && apiStatus !== task.status) {
          const resultUrl = statusData?.jobs?.[0]?.results?.raw?.url;
          const errorMessage = statusData?.jobs?.[0]?.error;
          
          const updatePayload = {
            status: apiStatus,
            result_url: resultUrl,
            error_message: errorMessage,
          };

          const tableName = 'video_tasks';
          const { error: updateError } = await supabaseAdmin
            .from(tableName)
            .update(updatePayload)
            .eq('id', task.id);

          if (updateError) {
            console.error(`Lỗi cập nhật tác vụ ${task.id} trong bảng ${tableName}:`, updateError);
          } else {
            tasksUpdated++;
            console.log(`Đã cập nhật tác vụ ${task.id} (${tableName}) sang trạng thái: ${apiStatus}`);
          }
        }
      } catch (e) {
        console.error(`Lỗi xử lý tác vụ ${task.id} (Higgsfield ID: ${task.higgsfield_task_id}):`, e.message);
      }
    }

    return new Response(JSON.stringify({ message: `Đã kiểm tra ${allTasks.length} tác vụ. Cập nhật ${tasksUpdated} tác vụ.` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Lỗi trong function check-task-status:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});