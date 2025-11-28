// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIN_INTERVAL_MINUTES = 10;

serve(async (req) => {
  console.log(`[INFO] Function auto-run-automation đã được gọi.`);
  // 1. Check for cron secret
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[LỖI] Không được phép: Sai hoặc thiếu khoá bí mật cron.');
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  console.log(`[INFO] Khoá bí mật cron đã được xác thực.`);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // 2. Get all configs with auto-run enabled directly from the database query
    console.log(`[INFO] Đang tìm các kênh đã bật chạy tự động...`);
    const { data: configs, error: configError } = await supabaseAdmin
      .from('automation_configs')
      .select('channel_id, user_id, config_data')
      .eq('config_data->>isAutoRunEnabled', 'true'); // Filter in the DB

    if (configError) {
        console.error(`[LỖI] Không thể tải cấu hình automation:`, configError.message);
        throw configError;
    }
    
    console.log(`[INFO] Tìm thấy tổng cộng ${configs.length} cấu hình có isAutoRunEnabled=true.`);

    // Further filter in JS for autoRunCount > 0
    const eligibleConfigs = configs.filter(c => c.config_data?.autoRunCount > 0);

    if (eligibleConfigs.length === 0) {
      console.log(`[INFO] Không tìm thấy kênh nào đủ điều kiện để chạy tự động sau khi lọc. Kết thúc.`);
      return new Response(JSON.stringify({ message: 'Không tìm thấy kênh nào đủ điều kiện để chạy tự động.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[INFO] Tìm thấy ${eligibleConfigs.length} kênh đủ điều kiện để xử lý.`);
    const summary = [];

    // 3. Loop through each eligible config
    for (const config of eligibleConfigs) {
      const { channel_id, user_id, config_data } = config;
      const autoRunCount = config_data.autoRunCount;
      console.log(`\n[XỬ LÝ] Đang xử lý Kênh ID: ${channel_id}`);

      try {
        // 4. Check for an active run
        console.log(`[XỬ LÝ] Kênh ${channel_id}: Đang kiểm tra các phiên chạy đang hoạt động...`);
        const { data: activeRun, error: activeRunError } = await supabaseAdmin
          .from('automation_runs')
          .select('id')
          .eq('channel_id', channel_id)
          .in('status', ['starting', 'running'])
          .maybeSingle();

        if (activeRunError) throw activeRunError;
        if (activeRun) {
          const message = `Kênh ${channel_id}: Bỏ qua, một automation khác đã đang chạy.`;
          console.log(`[BỎ QUA] ${message}`);
          summary.push(message);
          continue;
        }
        console.log(`[XỬ LÝ] Kênh ${channel_id}: Không tìm thấy phiên chạy nào đang hoạt động.`);

        // 5. Check daily run count (only for 'auto' runs)
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        console.log(`[XỬ LÝ] Kênh ${channel_id}: Đang kiểm tra các lần chạy tự động từ ${today.toISOString()}...`);
        const { count: runsToday, error: countError } = await supabaseAdmin
          .from('automation_runs')
          .select('*', { count: 'exact', head: true })
          .eq('channel_id', channel_id)
          .eq('trigger_type', 'auto')
          .gte('started_at', today.toISOString());

        if (countError) throw countError;
        console.log(`[XỬ LÝ] Kênh ${channel_id}: Tìm thấy ${runsToday} lần chạy tự động hôm nay. Giới hạn là ${autoRunCount}.`);
        if (runsToday >= autoRunCount) {
          const message = `Kênh ${channel_id}: Bỏ qua, đã đạt giới hạn ${autoRunCount} lần chạy tự động trong ngày.`;
          console.log(`[BỎ QUA] ${message}`);
          summary.push(message);
          continue;
        }

        // 6. Check time since last run (any type)
        console.log(`[XỬ LÝ] Kênh ${channel_id}: Đang kiểm tra thời gian từ lần chạy hoàn thành cuối cùng...`);
        const { data: lastRun, error: lastRunError } = await supabaseAdmin
          .from('automation_runs')
          .select('finished_at')
          .eq('channel_id', channel_id)
          .not('finished_at', 'is', null)
          .order('finished_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastRunError) throw lastRunError;
        if (lastRun && lastRun.finished_at) {
          const lastRunTime = new Date(lastRun.finished_at);
          const now = new Date();
          const minutesSinceLastRun = (now.getTime() - lastRunTime.getTime()) / (1000 * 60);
          console.log(`[XỬ LÝ] Kênh ${channel_id}: Lần chạy cuối cách đây ${minutesSinceLastRun.toFixed(1)} phút. Khoảng thời gian tối thiểu là ${MIN_INTERVAL_MINUTES}.`);

          if (minutesSinceLastRun < MIN_INTERVAL_MINUTES) {
            const message = `Kênh ${channel_id}: Bỏ qua, lần chạy cuối chỉ mới ${minutesSinceLastRun.toFixed(1)} phút trước.`;
            console.log(`[BỎ QUA] ${message}`);
            summary.push(message);
            continue;
          }
        } else {
            console.log(`[XỬ LÝ] Kênh ${channel_id}: Không tìm thấy lần chạy hoàn thành nào trước đó. Tiếp tục.`);
        }

        // 7. All checks passed, trigger automation
        console.log(`[KÍCH HOẠT] Kênh ${channel_id}: Tất cả kiểm tra đã qua. Đang gọi function 'run-automation'...`);
        const { error: invokeError } = await supabaseAdmin.functions.invoke('run-automation', {
          body: { channelId: channel_id, userId: user_id, trigger_type: 'auto' },
        });

        if (invokeError) {
          throw new Error(`Không thể gọi run-automation cho kênh ${channel_id}: ${invokeError.message}`);
        }
        
        const successMessage = `Kênh ${channel_id}: Đã kích hoạt chạy tự động thành công.`;
        console.log(`[THÀNH CÔNG] ${successMessage}`);
        summary.push(successMessage);

      } catch (channelError) {
        const errorMessage = `Kênh ${channel_id}: Thất bại với lỗi: ${channelError.message}`;
        console.error(`[LỖI] ${errorMessage}`);
        summary.push(errorMessage);
      }
    }

    console.log(`[INFO] Worker chạy tự động đã hoàn tất. Tóm tắt:`, summary);
    return new Response(JSON.stringify({ message: 'Worker chạy tự động đã hoàn tất.', summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[LỖI NGHIÊM TRỌNG] Lỗi nghiêm trọng trong function auto-run-automation:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});