-- 1. Xóa cron job cũ
SELECT cron.unschedule('check-task-status-job');

-- 2. Tạo lại cron job với lệnh gọi net.http_post trực tiếp
SELECT cron.schedule(
  'check-task-status-job',
  '* * * * *', -- Chạy mỗi phút
  $$
  select
    net.http_post(
        url:='https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/check-task-status',
        headers:=jsonb_build_object(
            'Authorization', 'Bearer f47ac10b-58cc-4372-a567-0e02b2c3d479'
        ),
        timeout_milliseconds:=10000
    );
  $$
);