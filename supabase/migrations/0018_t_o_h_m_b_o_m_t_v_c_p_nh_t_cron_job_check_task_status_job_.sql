-- 1. Tạo hàm bảo mật để gọi Edge Function 'check-task-status'
CREATE OR REPLACE FUNCTION public.trigger_check_task_status()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault', 'net'
AS $function$
DECLARE
  secret_value text;
  request_id bigint;
  url text;
BEGIN
  -- Lấy secret từ Vault một cách an toàn (phương pháp được khuyến nghị)
  secret_value := vault.get_secret('CRON_SECRET');

  -- Kiểm tra xem secret có tồn tại không
  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'CRON_SECRET not found in Supabase Vault. Please add it in the Vault UI.';
  END IF;

  -- Xây dựng URL cho Edge Function
  url := 'https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/check-task-status';

  -- Thực hiện yêu cầu HTTP POST
  SELECT
    id
  INTO
    request_id
  FROM
    net.http_post(
      url := url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || secret_value
      ),
      timeout_milliseconds := 10000
    );

  RETURN request_id;
END;
$function$;

-- 2. Xóa cron job cũ đang bị lỗi
SELECT cron.unschedule('check-task-status-job');

-- 3. Tạo lại cron job để chạy mỗi phút, gọi hàm bảo mật mới
SELECT cron.schedule(
  'check-task-status-job',
  '* * * * *', -- Chạy mỗi phút
  $$ SELECT public.trigger_check_task_status(); $$
);