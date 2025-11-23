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
    const { stepId } = await req.json();
    if (!stepId) {
      throw new Error("Thiếu tham số stepId.");
    }

    // Authenticate user
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

    // Use admin client for modifications
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Find the step and its run
    const { data: step, error: stepError } = await supabaseAdmin
      .from('automation_run_steps')
      .select('id, run_id, status')
      .eq('id', stepId)
      .single();

    if (stepError || !step) {
      throw new Error(`Không tìm thấy bước với ID: ${stepId}.`);
    }

    if (step.status !== 'failed') {
      throw new Error(`Chỉ có thể thử lại các bước đã thất bại. Trạng thái hiện tại: ${step.status}.`);
    }

    // Reset the step to pending
    const { error: updateStepError } = await supabaseAdmin
      .from('automation_run_steps')
      .update({
        status: 'pending',
        error_message: null,
        api_task_id: null,
        output_data: null,
        retry_count: 0 // Reset retry count
      })
      .eq('id', stepId);

    if (updateStepError) {
      throw new Error(`Không thể cập nhật bước: ${updateStepError.message}`);
    }

    // Also reset the parent run's status to 'running' if it was 'failed'
    const { error: updateRunError } = await supabaseAdmin
      .from('automation_runs')
      .update({ status: 'running', finished_at: null })
      .eq('id', step.run_id)
      .eq('status', 'failed'); // Only update if the whole run was marked as failed

    if (updateRunError) {
        // This is not a critical error, just log it
        console.warn(`Could not reset run status for run ${step.run_id}: ${updateRunError.message}`);
    }
    
    // Log the action
    await supabaseAdmin.from('automation_run_logs').insert({ 
        run_id: step.run_id, 
        step_id: stepId, 
        message: 'Người dùng đã yêu cầu thử lại bước này.', 
        level: 'INFO' 
    });

    return new Response(JSON.stringify({ success: true, message: 'Bước đã được xếp vào hàng đợi để thử lại.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Lỗi trong function retry-automation-step:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});