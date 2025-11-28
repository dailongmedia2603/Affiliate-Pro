CREATE OR REPLACE FUNCTION public.trigger_auto_run_automation()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  -- Cảnh báo: Việc hardcode khoá bí mật không được khuyến khích.
  -- Phương pháp an toàn hơn là sử dụng Supabase Vault: secret_value := vault.get_secret('CRON_SECRET');
  secret_value text := 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  request_id bigint;
  url text;
BEGIN
  -- Xây dựng URL cho Edge Function
  url := 'https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/auto-run-automation';

  -- Thực hiện yêu cầu HTTP POST
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

  -- Trả về ID của yêu cầu để ghi log
  RETURN request_id;
END;
$function$;