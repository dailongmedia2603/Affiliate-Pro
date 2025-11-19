// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { runId } = await req.json();
    if (!runId) {
      throw new Error("Thiếu tham số runId.");
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        throw new Error("Không tìm thấy Authorization header.");
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Không thể xác thực người dùng.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: runUpdateError } = await supabaseAdmin
      .from('automation_runs')
      .update({ status: 'stopped', finished_at: new Date().toISOString() })
      .eq('id', runId)
      .eq('user_id', user.id);

    if (runUpdateError) {
      throw new Error(`Không thể dừng phiên chạy: ${runUpdateError.message}`);
    }

    const { error: stepsUpdateError } = await supabaseAdmin
      .from('automation_run_steps')
      .update({ status: 'cancelled' })
      .eq('run_id', runId)
      .in('status', ['pending', 'running']);

    if (stepsUpdateError) {
      throw new Error(`Không thể hủy các bước đang chạy: ${stepsUpdateError.message}`);
    }
    
    await supabaseAdmin.from('automation_run_logs').insert({ run_id: runId, message: 'Phiên chạy đã được người dùng dừng lại.', level: 'WARN' });

    return new Response(JSON.stringify({ success: true, message: 'Phiên chạy đã được dừng thành công.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Lỗi trong function stop-automation:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});