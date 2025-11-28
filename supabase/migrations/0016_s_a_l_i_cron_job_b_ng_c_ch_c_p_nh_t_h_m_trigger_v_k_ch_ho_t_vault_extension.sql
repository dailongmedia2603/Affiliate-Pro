-- Bước 1: Kích hoạt extension Supabase Vault nếu chưa có.
-- Lệnh này sẽ tạo schema 'vault' và các hàm cần thiết.
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Bước 2: Cập nhật lại hàm để sử dụng đúng schema 'vault'.
CREATE OR REPLACE FUNCTION public.trigger_auto_run_automation()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 -- Sửa lại search_path để bao gồm 'vault' thay vì 'supabase_vault'
 SET search_path TO 'public', 'extensions', 'vault', 'net'
AS $function$
DECLARE
  secret_value text;
  request_id bigint;
  url text;
BEGIN
  -- Lấy secret từ vault. Yêu cầu hàm phải là SECURITY DEFINER.
  -- Sửa lại lời gọi hàm để sử dụng schema 'vault'.
  secret_value := vault.get_secret('CRON_SECRET');

  -- Kiểm tra xem secret có được lấy thành công không
  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'CRON_SECRET not found in Supabase Vault. Please add it in the Vault UI.';
  END IF;

  -- Xây dựng URL cho Edge Function bằng project ID
  url := 'https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/auto-run-automation';

  -- Thực hiện yêu cầu HTTP POST bằng hàm net.http_post
  SELECT
    id
  INTO
    request_id
  FROM
    net.http_post(
      url := url,
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret_value
      ),
      timeout_milliseconds := 10000
    );

  -- Trả về ID của yêu cầu để ghi log trong lịch sử cron job
  RETURN request_id;
END;
$function$;