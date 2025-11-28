CREATE OR REPLACE FUNCTION public.trigger_auto_run_automation()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 -- IMPORTANT: Set a secure search_path that includes necessary extension schemas
 SET search_path = public, extensions, supabase_vault, net
AS $function$
DECLARE
  secret_value text;
  request_id bigint;
  url text;
BEGIN
  -- Get the secret from the vault. This requires the function to be SECURITY DEFINER.
  secret_value := supabase_vault.get_secret('CRON_SECRET');

  -- Check if the secret was retrieved successfully
  IF secret_value IS NULL THEN
    RAISE EXCEPTION 'CRON_SECRET not found in Supabase Vault. Please add it in the Vault UI.';
  END IF;

  -- Construct the URL for the Edge Function using the project ID
  url := 'https://hfmpmrlwduhtegkjaclu.supabase.co/functions/v1/auto-run-automation';

  -- Perform the HTTP POST request using the net.http_post function
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

  -- Return the request ID for logging in the cron job history
  RETURN request_id;
END;
$function$