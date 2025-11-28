-- 1. Xóa cron job cũ
SELECT cron.unschedule('auto-run-automation-job');

-- 2. Tạo lại cron job với lệnh gọi net.http_post trực tiếp
SELECT cron.schedule(
  'auto-run-automation-job',
  '*/10 * * * *', -- Chạy mỗi 10 phút
  $$
  select
    net.http_post(
        url:='https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/auto-run-automation',
        headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer f47ac10b-58cc-4372-a567-0e02b2c3d479'
        ),
        body:='{}'::jsonb,
        timeout_milliseconds:=10000
    );
  $$
);