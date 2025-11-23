// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logToDb = async (supabaseAdmin, runId, message, level = 'INFO', stepId = null) => {
  if (!runId) return;
  try {
    await supabaseAdmin.from('automation_run_logs').insert({ run_id: runId, step_id: stepId, message, level });
  } catch (e) { console.error('Failed to write log to DB:', e.message); }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  
  let stepId = null;
  let runId = null;

  try {
    const { stepId: reqStepId, userId } = await req.json();
    stepId = reqStepId;
    if (!stepId || !userId) {
      throw new Error("Thiếu stepId hoặc userId.");
    }

    const { data: step, error: stepError } = await supabaseAdmin
      .from('automation_run_steps')
      .select('input_data, run_id')
      .eq('id', stepId)
      .single();

    if (stepError || !step) throw new Error(`Không tìm thấy bước ${stepId}: ${stepError?.message}`);
    runId = step.run_id;
    
    await logToDb(supabaseAdmin, runId, 'Bắt đầu bước ghép video.', 'INFO', stepId);

    const { data: runData, error: runError } = await supabaseAdmin.from('automation_runs').select('channel_id').eq('id', runId).single();
    if (runError || !runData) throw new Error(`Không tìm thấy phiên chạy ${runId}.`);

    const [settingsRes, configRes] = await Promise.all([
      supabaseAdmin.from('user_settings').select('rendi_api_key').eq('id', userId).single(),
      supabaseAdmin.from('automation_configs').select('config_data').eq('channel_id', runData.channel_id).single()
    ]);

    if (settingsRes.error || !settingsRes.data?.rendi_api_key) {
      throw new Error("Chưa cấu hình Rendi API Key trong Cài đặt.");
    }
    if (configRes.error || !configRes.data?.config_data) {
      throw new Error("Không tìm thấy cấu hình automation cho kênh.");
    }

    const rendiApiKey = settingsRes.data.rendi_api_key;
    const config = configRes.data.config_data;
    const { video_urls } = step.input_data;

    if (!video_urls || video_urls.length === 0) {
      throw new Error("Không có video nào để ghép.");
    }

    const input_files = {};
    video_urls.forEach((url, i) => {
      input_files[`in_${i}`] = url;
    });

    const output_files = { 'out_final': 'final_output.mp4' };
    let ffmpeg_command = '';

    if (video_urls.length === 1) {
      ffmpeg_command = `-i {{in_0}} -c copy {{out_final}}`;
      await logToDb(supabaseAdmin, runId, 'Chỉ có 1 video, sao chép trực tiếp.', 'INFO', stepId);
    } else {
      const videoDuration = config.videoDuration || 5;
      const transitionDuration = 1;

      if (videoDuration <= transitionDuration) {
        throw new Error(`Thời lượng video (${videoDuration}s) phải lớn hơn thời lượng chuyển cảnh (${transitionDuration}s).`);
      }

      const filterComplexParts = [];
      video_urls.forEach((_, i) => {
        filterComplexParts.push(`[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,setsar=1[v${i}]`);
      });

      let lastStream = '[v0]';
      for (let i = 1; i < video_urls.length; i++) {
        const offset = i * (videoDuration - transitionDuration);
        const outStream = (i === video_urls.length - 1) ? '[vout]' : `[vt${i}]`;
        filterComplexParts.push(`${lastStream}[v${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${offset}${outStream}`);
        lastStream = outStream;
      }

      const filterComplex = `"${filterComplexParts.join(';')}"`;
      ffmpeg_command = `-filter_complex ${filterComplex} -map "[vout]" -c:v libx264 -pix_fmt yuv420p {{out_final}}`;
      await logToDb(supabaseAdmin, runId, `Đã xây dựng lệnh FFMPEG để ghép ${video_urls.length} video.`, 'INFO', stepId);
    }

    const payload = { input_files, output_files, ffmpeg_command };
    const { data: rendiData, error: rendiError } = await supabaseAdmin.functions.invoke('proxy-rendi-api', {
      body: {
        action: 'run_command',
        payload,
        rendi_api_key: rendiApiKey // Pass the key directly
      }
    });

    if (rendiError) {
      const errorBody = await rendiError.context.json();
      const errorMessage = errorBody.error || JSON.stringify(errorBody);
      throw new Error(`Lỗi từ proxy-rendi-api: ${errorMessage}`);
    }
    if (rendiData.error) throw new Error(rendiData.error);
    if (!rendiData.command_id) throw new Error("Rendi API không trả về command_id.");

    await supabaseAdmin
      .from('automation_run_steps')
      .update({ api_task_id: rendiData.command_id })
      .eq('id', stepId);

    await logToDb(supabaseAdmin, runId, `Đã gửi yêu cầu đến Rendi thành công. Command ID: ${rendiData.command_id}`, 'SUCCESS', stepId);

    return new Response(JSON.stringify({ success: true, command_id: rendiData.command_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const detailedErrorMessage = error.message;
    console.error('!!! [LỖI] Đã xảy ra lỗi trong automation-worker-rendi:', detailedErrorMessage);
    if (stepId && runId) {
      await supabaseAdmin.from('automation_run_steps').update({ status: 'failed', error_message: detailedErrorMessage }).eq('id', stepId);
      await supabaseAdmin.from('automation_runs').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', runId);
      await logToDb(supabaseAdmin, runId, `Bước ghép video thất bại: ${detailedErrorMessage}`, 'ERROR', stepId);
    }
    return new Response(JSON.stringify({ error: detailedErrorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});